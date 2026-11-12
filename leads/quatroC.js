// O LEAD NO 4C (CRM comercial)
//
// Cada lead do site vira, no 4C: o cliente (como lead) e um negócio em FUNIL ATIVO › PROSPECÇÃO,
// com o Kesller de responsável, origem "InBound - Site", temperatura QUENTE, e uma anotação com
// tudo que a pessoa escreveu. É o mesmo funil e o mesmo responsável dos leads da prospecção da
// Central (backend/lib/prospeccao/lead.js no repositório da Central).
//
// Token e usuário vêm de API_4C_TOKEN e API_4C_USER_UUID no painel de deploy. Este repositório é
// PÚBLICO: o token nunca entra no código, em log ou em resposta.
//
// Armadilhas da API (memória do projeto da Central):
//   - nome com &, apóstrofo, travessão, +, !, |, aspas ou ; é recusado; nome com menos de 4 letras
//     também;
//   - 409 = já existe cliente com esse nome; `force_create` grava mesmo assim (é outra pessoa
//     com o mesmo nome — quem já é cliente a busca por e-mail/celular acha antes);
//   - origem que não bate exatamente com uma existente vira origem NOVA (em maiúsculas).

'use strict';

const BASE = (process.env.API_4C_BASE || 'https://app.4c.tec.br/api/v1').replace(/\/+$/, '');
const FUNIL = 'b6f7526f-08b5-488e-8be6-5899578d9d45';   // FUNIL ATIVO
const ETAPA = '66693a35-2e86-424e-820d-5a7f0fa11bcc';   // PROSPECÇÃO
const RESPONSAVEL = '5d90d9a1-864b-43f7-bea0-283d9f9d79e3';   // Kesller Pinheiro
const ORIGEM = 'InBound - Site';
const INTERVALO_MS = 600;   // a API limita; a Central usa o mesmo ritmo
const TEMPO_MS = 15000;

const token = () => String(process.env.API_4C_TOKEN || '').trim();
const usuario = () => String(process.env.API_4C_USER_UUID || '').trim();
const configurado = () => Boolean(token() && usuario());

// Uma chamada por vez, com intervalo, para o processo inteiro.
let fila = Promise.resolve();
let ultima = 0;
function chamar(metodo, caminho, { params, data } = {}) {
    const vez = fila.then(async () => {
        const falta = ultima + INTERVALO_MS - Date.now();
        if (falta > 0) await new Promise((r) => setTimeout(r, falta));
        ultima = Date.now();
        const url = new URL(BASE + caminho);
        for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
        const r = await fetch(url, {
            method: metodo.toUpperCase(),
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token(), 'X-User-Uuid': usuario() },
            body: data ? JSON.stringify(data) : undefined,
            signal: AbortSignal.timeout(TEMPO_MS),
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
    });
    fila = vez.catch(() => {});
    return vez;
}
const itens = (body) => { const d = body && body.data; return Array.isArray(d) ? d : (d && (d.items || d.data)) || []; };

// O 4C recusa esses caracteres em nome (mesma troca que a Central usa, aprovada pelo Leonardo).
const limpa = (s) => String(s || '').replace(/&#0?39;|'/g, '').replace(/\s*&\s*/g, ' E ').replace(/\s*[–—]\s*/g, ' - ')
    .replace(/\s*\+\s*/g, ' MAIS ').replace(/ª/g, 'A').replace(/º/g, 'O').replace(/\s*%/g, ' POR CENTO').replace(/[!|";<>{}$`\\]/g, '')
    .replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '');

/** O cliente que já existe com esse e-mail ou celular (o filtro do 4C é parcial; aqui confere exato). */
async function clienteExistente(lead) {
    if (lead.emailValido) {
        const r = await chamar('get', '/customers/all', { params: { 'filters[email]': lead.email } });
        const achou = itens(r.body).find((c) => String(c.email || '').toLowerCase() === lead.email);
        if (achou) return achou;
    }
    if (lead.celular) {
        const r = await chamar('get', '/customers/all', { params: { 'filters[cellphone]': lead.celular } });
        const achou = itens(r.body).find((c) => String(c.cellphone || '').replace(/\D/g, '').endsWith(lead.celular));
        if (achou) return achou;
    }
    return null;
}

function nomeDoCliente(lead) {
    const nome = limpa(lead.nome) || limpa(lead.email.split('@')[0]);
    return nome.replace(/[^\p{L}]/gu, '').length >= 4 ? nome : `${nome} SITE`.trim();
}

/**
 * Cadastra o lead. Devolve { ok, cliente, negocio, existente } ou { ok: false, erro } — o erro é
 * texto para o e-mail do comercial (nunca contém o token).
 */
async function cadastrar(lead, nota) {
    if (!configurado()) return { ok: false, erro: 'o 4C não está configurado no servidor do site (API_4C_TOKEN / API_4C_USER_UUID)' };
    try {
        let cliente = await clienteExistente(lead);
        const existente = Boolean(cliente);
        if (!cliente) {
            const corpo = { name: nomeDoCliente(lead), isLead: 1 };
            if (lead.emailValido) corpo.email = lead.email;
            if (lead.celular) corpo.cellphone = lead.celular;
            if (limpa(lead.empresa).length >= 2) corpo.business = { name: limpa(lead.empresa) };
            let r = await chamar('post', '/customers/store', { data: corpo });
            if (r.status === 409) r = await chamar('post', '/customers/store', { data: { ...corpo, force_create: true } });
            // Nome de empresa recusado não pode custar o lead: grava sem ele (ele vai na anotação).
            if (r.status === 400 && corpo.business) {
                delete corpo.business;
                r = await chamar('post', '/customers/store', { data: corpo });
                if (r.status === 409) r = await chamar('post', '/customers/store', { data: { ...corpo, force_create: true } });
            }
            if (r.status !== 200 || !r.body || !r.body.data) return { ok: false, erro: `o 4C recusou o cliente (${r.status}): ${JSON.stringify((r.body && (r.body.errors || r.body.message)) || '').slice(0, 300)}` };
            cliente = r.body.data;
        }

        const titulo = `NEGÓCIO ${limpa(lead.empresa || lead.nome || lead.email).toUpperCase()}`.slice(0, 120);
        const n = await chamar('post', `/cards/${FUNIL}/${ETAPA}/store`, {
            data: { title: titulo, value: '0.00', customerUuid: cliente.uuid, responsibleUuid: RESPONSAVEL, origin: ORIGEM, temperature: 'QUENTE' },
        });
        if (n.status !== 200 || !n.body || !n.body.data) {
            return { ok: false, cliente: cliente.uuid, existente, erro: `o cliente ${existente ? 'já existia' : 'foi criado'} no 4C, mas o negócio foi recusado (${n.status}): ${JSON.stringify((n.body && (n.body.errors || n.body.message)) || '').slice(0, 300)}` };
        }
        const negocio = n.body.data.uuid;
        const a = await chamar('post', `/card-notes/${negocio}/store`, { data: { note: nota, authorUuid: usuario() } });
        return { ok: true, cliente: cliente.uuid, negocio, existente, anotacao: a.status === 200 };
    } catch (err) {
        return { ok: false, erro: `falha ao falar com o 4C: ${err.name === 'TimeoutError' ? 'tempo esgotado' : err.message}` };
    }
}

module.exports = { cadastrar, configurado, limpa, FUNIL, ETAPA, RESPONSAVEL, ORIGEM };
