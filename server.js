// Servidor estático simples, sem dependências, só para rodar o site em localhost.
// Não altera HTML/CSS/JS do projeto: apenas serve os arquivos como estão.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = process.env.PORT || 5500;

// Domínio canônico. Sem isto, www e sem-www respondiam 200 os dois e o Google via dois sites
// com o mesmo conteúdo. A tag canonical já apontava para cá, mas 301 é o sinal forte.
const HOST_CANONICO = process.env.HOST_CANONICO || 'axxiscontabilidadedigital.com.br';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  // Sem estas duas, sitemap.xml e robots.txt saíam como application/octet-stream e os
  // rastreadores não os liam, o que prejudicava a indexação do site inteiro.
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Endereços antigos das páginas de conteúdo, de quando elas viviam na raiz.
const REDIRECTS = {
  '/conteudos.html': '/conteudos/',
  '/conteudos-categoria-abertura.html': '/conteudos/categoria-abertura.html',
  '/conteudos-categoria-mei.html': '/conteudos/categoria-mei.html',
  '/conteudos-categoria-impostos.html': '/conteudos/categoria-impostos.html',
  '/conteudos-categoria-gestao.html': '/conteudos/categoria-gestao.html',
  '/conteudo-abrir-empresa-prestador-de-servico.html': '/conteudos/abrir-empresa-prestador-de-servico.html',
  '/conteudo-mei-ou-me-quando-migrar.html': '/conteudos/mei-ou-me-quando-migrar.html',
  '/conteudo-pro-labore-e-distribuicao-de-lucros.html': '/conteudos/pro-labore-e-distribuicao-de-lucros.html',
  '/conteudo-nota-fiscal-de-servico-erros-comuns.html': '/conteudos/nota-fiscal-de-servico-erros-comuns.html',
  '/conteudo-trocar-de-contador-sem-parar-a-operacao.html': '/conteudos/trocar-de-contador-sem-parar-a-operacao.html',
  '/conteudo-calendario-de-obrigacoes-da-pj.html': '/conteudos/calendario-de-obrigacoes-da-pj.html',
};

// Só faz sentido comprimir o que é texto. WebP, PNG e woff2 já vêm comprimidos, e passá-los
// pelo gzip gasta CPU para render um arquivo do mesmo tamanho ou maior.
const COMPRIMIVEIS = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt']);

// CSS e JS carregam ?v=NN no HTML, então trocar o número já invalida o cache: podem ficar um
// ano. Imagem não tem essa marca e às vezes é substituída no mesmo nome, daí os 30 dias. HTML
// nunca fica em cache, senão uma correção de texto demoraria a aparecer.
const CACHE = {
  '.html': 'no-cache',
  '.css': 'public, max-age=31536000, immutable',
  '.js': 'public, max-age=31536000, immutable',
  '.xml': 'public, max-age=3600',
  '.txt': 'public, max-age=3600',
};
const CACHE_ASSET = 'public, max-age=2592000';

function cacheDe(ext) {
  return CACHE[ext] || CACHE_ASSET;
}

function responder(req, res, data, ext) {
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cacheDe(ext),
  };

  const aceita = req.headers['accept-encoding'] || '';
  if (!COMPRIMIVEIS.has(ext) || data.length < 1024) {
    res.writeHead(200, headers);
    res.end(data);
    return;
  }

  // Brotli comprime melhor que gzip e todo navegador atual aceita; gzip fica como reserva
  // para clientes antigos e para alguns rastreadores.
  const [codec, comprimir] = /\bbr\b/.test(aceita)
    ? ['br', zlib.brotliCompress]
    : /\bgzip\b/.test(aceita)
      ? ['gzip', zlib.gzip]
      : [null, null];

  if (!codec) {
    res.writeHead(200, headers);
    res.end(data);
    return;
  }

  comprimir(data, (err, comprimido) => {
    if (err) {
      res.writeHead(200, headers);
      res.end(data);
      return;
    }
    headers['Content-Encoding'] = codec;
    // Sem Vary, um proxy pode entregar a versão comprimida a quem não aceita compressão.
    headers.Vary = 'Accept-Encoding';
    res.writeHead(200, headers);
    res.end(comprimido);
  });
}

// Formulários do site. A página envia para /api/lead e o servidor repassa ao n8n, para o
// endereço do webhook não ficar no código que qualquer visitante vê. Em 11/11/2026 um robô
// leu esse endereço na página e mandou sondagens direto para o n8n.
// O destino pode vir da variável LEAD_WEBHOOK_URL no painel de deploy (inclusive um endereço
// interno, http://...); o valor abaixo vale enquanto ela não existir.
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL
  || 'https://n8n.axxiscontabilidadedigital.com.br/webhook/axxisdigital';
const LEAD_CAMPOS = new Set([
  'nome', 'empresa', 'whatsapp', 'email', 'contato', 'interesse', 'mensagem', 'assunto',
  'website', 'origem_formulario', 'pagina', 'enviado_em',
]);
const LEAD_MAX_BYTES = 10 * 1024;
const LEAD_LIMITE = 8;
const LEAD_JANELA_MS = 10 * 60 * 1000;
const leadEnvios = new Map();

function responderJson(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

// Atrás do proxy do deploy, x-real-ip é o IP de quem acessou. O x-forwarded-for pode chegar
// já preenchido pelo próprio cliente, então não serve para limitar envios.
function ipDoCliente(req) {
  return String(req.headers['x-real-ip'] || req.socket.remoteAddress || '').trim();
}

function passouDoLimite(ip) {
  const agora = Date.now();
  const recentes = (leadEnvios.get(ip) || []).filter((t) => agora - t < LEAD_JANELA_MS);
  recentes.push(agora);
  leadEnvios.set(ip, recentes);
  // Limpeza de quem já saiu da janela, para o mapa não crescer sem fim.
  if (leadEnvios.size > 5000) {
    for (const [chave, tempos] of leadEnvios) {
      if (agora - tempos[tempos.length - 1] >= LEAD_JANELA_MS) leadEnvios.delete(chave);
    }
  }
  return recentes.length > LEAD_LIMITE;
}

// O navegador sempre manda Origin num POST. Exigir que seja o próprio site corta robô que
// dispara direto de script; não é à prova de quem forja o cabeçalho, para isso existe o filtro no n8n.
function mesmaOrigem(req) {
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  try {
    return new URL(req.headers.origin || '').hostname.toLowerCase() === host;
  } catch (err) {
    return false;
  }
}

function encaminharLead(dados, ip, pronto) {
  let respondido = false;
  const fim = (ok) => {
    if (respondido) return;
    respondido = true;
    pronto(ok);
  };

  let destino;
  try {
    destino = new URL(LEAD_WEBHOOK_URL);
  } catch (err) {
    console.error('LEAD_WEBHOOK_URL inválida:', err.message);
    fim(false);
    return;
  }

  const corpo = JSON.stringify(dados);
  const cliente = destino.protocol === 'http:' ? http : https;
  const pedido = cliente.request(destino, {
    method: 'POST',
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(corpo),
      'User-Agent': 'axxis-site',
      'X-Cliente-IP': ip,
    },
  }, (resposta) => {
    resposta.resume();
    resposta.on('end', () => fim(resposta.statusCode >= 200 && resposta.statusCode < 300));
  });
  pedido.on('timeout', () => pedido.destroy(new Error('tempo esgotado')));
  pedido.on('error', (err) => {
    console.error('Falha ao repassar o formulário ao n8n:', err.message);
    fim(false);
  });
  pedido.end(corpo);
}

function receberLead(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    res.end();
    return;
  }

  const ip = ipDoCliente(req);
  if (!mesmaOrigem(req)) return responderJson(res, 403, { ok: false });
  if (passouDoLimite(ip)) return responderJson(res, 429, { ok: false });
  if (!/application\/json/i.test(req.headers['content-type'] || '')) return responderJson(res, 415, { ok: false });
  if (Number(req.headers['content-length']) > LEAD_MAX_BYTES) {
    responderJson(res, 413, { ok: false });
    req.resume();
    return;
  }

  const partes = [];
  let tamanho = 0;
  let grandeDemais = false;
  req.on('data', (parte) => {
    tamanho += parte.length;
    if (tamanho > LEAD_MAX_BYTES) grandeDemais = true;
    else partes.push(parte);
  });
  req.on('end', () => {
    if (grandeDemais) return responderJson(res, 413, { ok: false });

    let dados;
    try {
      dados = JSON.parse(Buffer.concat(partes).toString('utf8'));
    } catch (err) {
      return responderJson(res, 400, { ok: false });
    }
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return responderJson(res, 400, { ok: false });

    // Só segue o que os formulários do site mandam, e só como texto.
    const limpo = {};
    for (const [chave, valor] of Object.entries(dados)) {
      if (LEAD_CAMPOS.has(chave) && typeof valor === 'string') limpo[chave] = valor.slice(0, 2000);
    }

    encaminharLead(limpo, ip, (ok) => responderJson(res, ok ? 200 : 502, { ok }));
  });
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/lead') {
    receberLead(req, res);
    return;
  }

  // decodeURIComponent lança URIError em qualquer sequência percent malformada (ex.: "/%").
  // Como isto acontece dentro do handler, a exceção não capturada derrubava o processo
  // inteiro: um único pedido de um bot tirava o site do ar até o container reiniciar.
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Requisição inválida');
    return;
  }

  // Redirect do www para o domínio canônico. Só dispara quando o host bate com o canônico,
  // para localhost e qualquer ambiente de teste seguirem funcionando normalmente.
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  if (host === `www.${HOST_CANONICO}`) {
    res.writeHead(301, {
      Location: `https://${HOST_CANONICO}${req.url}`,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end();
    return;
  }

  // As páginas de conteúdo saíram da raiz para /conteudos/. O 301 preserva quem já tinha o
  // link antigo (o sitemap chegou a ser enviado com eles) e passa o sinal para o novo
  // endereço em vez de deixar o Google achar 404.
  const destino = REDIRECTS[urlPath];
  if (destino) {
    res.writeHead(301, { Location: destino, 'Cache-Control': 'public, max-age=86400' });
    res.end();
    return;
  }

  // /conteudos e /conteudos/ seriam duas URLs para a mesma página. Sem isto o servidor
  // entregaria as duas com 200, que é exatamente o problema de conteúdo duplicado que o
  // redirect do www acabou de resolver.
  if (urlPath === '/conteudos') {
    res.writeHead(301, { Location: '/conteudos/', 'Cache-Control': 'public, max-age=86400' });
    res.end();
    return;
  }

  let filePath = path.join(ROOT, urlPath);

  if (urlPath.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'EISDIR') {
        fs.readFile(path.join(filePath, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Não encontrado');
            return;
          }
          responder(req, res, data2, '.html');
        });
        return;
      }
      res.writeHead(404);
      res.end('Não encontrado');
      return;
    }

    responder(req, res, data, path.extname(filePath).toLowerCase());
  });
});

server.listen(PORT, () => {
  console.log(`Axxis site rodando em http://localhost:${PORT}`);
});
