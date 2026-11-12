// O CAMINHO DE UM LEAD: formulário → validação → 4C → e-mail para o comercial
//
// Sem n8n no meio. Antes os formulários chamavam webhooks públicos do n8n, e em 11/11/2026 um
// robô leu esses endereços nas páginas e chegou a gravar dois leads falsos no CRM. Agora o
// navegador só fala com o próprio site, e quem fala com o 4C é este servidor, com o token no
// painel de deploy.
//
// Além da validação (validacao.js), três freios contra enxurrada, todos em memória:
//   - por IP: LIMITE_IP leads aceitos por hora;
//   - no total: LIMITE_GLOBAL leads aceitos por hora, somando os dois sites — o normal é um por
//     semana, então isto só dispara em ataque, e aí o 4C não recebe lixo em massa;
//   - repetição: o mesmo e-mail ou celular dentro de REPETIDO_MS conta uma vez só.

'use strict';

const { validar } = require('./validacao');
const quatroC = require('./quatroC');
const email = require('./email');

const HORA = 60 * 60 * 1000;
const LIMITE_IP = 5;
const LIMITE_GLOBAL = 20;
const REPETIDO_MS = 30 * 60 * 1000;

const porIp = new Map();
let globais = [];
const vistos = new Map();

function recentes(lista, agora, janela) { return lista.filter((t) => agora - t < janela); }
function limpar(agora) {
    if (porIp.size > 5000) for (const [k, v] of porIp) if (!recentes(v, agora, HORA).length) porIp.delete(k);
    if (vistos.size > 5000) for (const [k, t] of vistos) if (agora - t >= REPETIDO_MS) vistos.delete(k);
}

const agoraSP = (d) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

function anotacao(lead, ip, quando) {
    return [
        `Lead do site ${lead.siteNome} (${lead.site === 'consultiva' ? 'axxiscontabilidade.com.br' : 'axxiscontabilidadedigital.com.br'}) em ${quando}.`,
        lead.newsletter && 'Inscrição na newsletter do blog.',
        lead.formulario && `Formulário: ${lead.formulario}`,
        lead.pagina && `Página: ${lead.pagina}`,
        lead.empresa && `Empresa informada: ${lead.empresa}`,
        lead.cargo && `Cargo: ${lead.cargo}`,
        (lead.interesse || lead.assunto) && `Interesse: ${lead.interesse || lead.assunto}`,
        lead.erp && `Usa ERP: ${lead.erp}`,
        lead.faturamento && `Faturamento: ${lead.faturamento}`,
        lead.telefone && `WhatsApp informado: ${lead.telefone}`,
        lead.email && `E-mail informado: ${lead.email}`,
        lead.mensagem && `Mensagem: ${lead.mensagem}`,
        Object.keys(lead.utm).length && `Campanha: ${Object.entries(lead.utm).map(([k, v]) => `${k}=${v}`).join(' ')}`,
        ip && `IP: ${ip}`,
    ].filter(Boolean).join('\n');
}

/**
 * Recebe um lead. `site` = "digital" | "consultiva"; `campos` = corpo do formulário; `ip` = de quem
 * enviou. Devolve { status, corpo } para responder ao navegador.
 */
async function receber(site, campos, ip, { agora = new Date() } = {}) {
    const lead = validar(site, campos);
    const t = agora.getTime();
    limpar(t);

    if (lead.spam) {
        console.warn(`[lead] ${site}: descartado (${lead.spam}) ip=${ip}`);
        return { status: 200, corpo: { ok: true } };
    }
    if (lead.motivo) return { status: 400, corpo: { ok: false, erro: lead.motivo } };

    const doIp = recentes(porIp.get(ip) || [], t, HORA);
    globais = recentes(globais, t, HORA);
    if (doIp.length >= LIMITE_IP || globais.length >= LIMITE_GLOBAL) {
        console.warn(`[lead] ${site}: limite (${doIp.length >= LIMITE_IP ? 'do IP' : 'global'}) ip=${ip}`);
        return { status: 429, corpo: { ok: false, erro: 'Recebemos muitos envios agora. Tente de novo em alguns minutos ou fale pelo WhatsApp.' } };
    }

    const chaves = [lead.emailValido && `e:${lead.email}`, lead.celular && `c:${lead.celular}`].filter(Boolean);
    if (chaves.some((k) => vistos.has(k) && t - vistos.get(k) < REPETIDO_MS)) {
        console.warn(`[lead] ${site}: repetido em menos de 30 min, ignorado ip=${ip}`);
        return { status: 200, corpo: { ok: true } };
    }
    doIp.push(t); porIp.set(ip, doIp);
    globais.push(t);
    for (const k of chaves) vistos.set(k, t);

    const quando = agoraSP(agora);
    const crm = await quatroC.cadastrar(lead, anotacao(lead, ip, quando));
    const aviso = await email.avisar(lead, crm, quando);
    console.log(`[lead] ${site}: 4C ${crm.ok ? `ok negocio=${crm.negocio}${crm.existente ? ' (cliente existente)' : ''}` : `FALHOU (${crm.erro})`} | e-mail ${aviso.ok ? 'ok' : `FALHOU (${aviso.erro})`}`);

    if (!crm.ok && !aviso.ok) {
        // Nem 4C nem e-mail: o lead se perderia calado. A página mostra o erro e o WhatsApp.
        return { status: 502, corpo: { ok: false, erro: 'Não foi possível enviar agora. Tente novamente ou fale pelo WhatsApp.' } };
    }
    return { status: 200, corpo: { ok: true } };
}

function configuracao() {
    return { quatroC: quatroC.configurado(), email: email.configurado() };
}

module.exports = { receber, configuracao, anotacao };
