// Servidor estático simples, sem dependências, só para rodar o site em localhost.
// Não altera HTML/CSS/JS do projeto: apenas serve os arquivos como estão.
const http = require('http');
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

const server = http.createServer((req, res) => {
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
