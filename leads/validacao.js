// O QUE CHEGA DOS FORMULÁRIOS, E O QUE VIRA LEAD
//
// Dois sites mandam lead para este servidor:
//   - o Digital (este repositório), em JSON, por assets/js/main.js. Três formatos: formulário de
//     página (nome, empresa, whatsapp, email, interesse, mensagem), popup de boas-vindas (nome,
//     contato = e-mail OU celular, interesse) e newsletter do blog (assunto, email);
//   - a Consultiva (axxiscontabilidade.com.br), em form-urlencoded, pelo "Solicite sua Proposta"
//     (nome, telefone, email, empresa, cargo, erp, faturamento, mensagem, website, consentimento,
//     pagina, t e as utm_*). O nginx de lá repassa para cá.
//
// Função pura: recebe os campos e devolve o lead normalizado com `motivo` (por que foi recusado)
// e `spam` (recusa silenciosa: o robô recebe "ok" e não aprende nada).
//
// Os filtros vêm do ataque de 11/11/2026: um robô mandou ={{7*7}}, a página
// http://127.0.0.1:5678/rest/settings e e-mails descartáveis direto para o n8n, que antes recebia
// estes formulários.

'use strict';

const SITES = { digital: 'Digital', consultiva: 'Consultiva' };

const texto = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v) : '';
const linha = (v, max = 200) => texto(v).replace(/\s+/g, ' ').trim().slice(0, max);
const digitos = (v) => texto(v).replace(/\D/g, '');

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DESCARTAVEL = /@([a-z0-9-]+\.)*(guerrillamail|guerrillamailblock|sharklasers|grr|mailinator|10minutemail|temp-mail|tempmail|tempmailo|yopmail|trashmail|dispostable|maildrop|getnada|throwawaymail|mohmal|emailondeck|mailnesia|spamgourmet|fakeinbox|mailpoof|tmail|tmpmail|emailfake|fakemail|burnermail|minutemail)\./i;
// Expressão de template, tag HTML, javascript: e endereço interno: nada disso aparece num lead de
// verdade, e tudo isso apareceu no ataque.
const SONDAGEM = /\{\{|\}\}|\$\{|<%|<\s*\/?\s*[a-z!]|javascript:|127\.0\.0\.1|localhost|0\.0\.0\.0|::1|169\.254\.|:5678|\/rest\/|\/webhook/i;

/** Celular no formato do 4C (só dígitos, com DDD), ou null. O 9 que falta no celular antigo entra. */
function celular(v) {
    let d = digitos(v).replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
    if (d.length !== 10 && d.length !== 11) return null;
    // Número de mentira: tudo igual depois do DDD (61 99999-9999) ou o "99999-0000" do ataque.
    const resto = d.slice(2);
    if (/^(\d)\1+$/.test(resto) || /^9?(\d)\1{3}0000$/.test(resto)) return null;
    return d;
}

/**
 * Normaliza e valida. `site` é "digital" ou "consultiva"; `campos` é o corpo já lido (objeto de
 * texto). Nunca lança: campo estranho vira vazio.
 */
function validar(site, campos) {
    const d = campos && typeof campos === 'object' && !Array.isArray(campos) ? campos : {};
    const consultiva = site === 'consultiva';

    let email = linha(d.email, 160).toLowerCase();
    let telefone = linha(consultiva ? d.telefone : d.whatsapp, 40);
    const contato = linha(d.contato, 160);
    if (contato) {
        if (contato.includes('@')) { if (!email) email = contato.toLowerCase(); }
        else if (!telefone) telefone = contato;
    }

    const lead = {
        site,
        siteNome: SITES[site] || site,
        nome: linha(d.nome, 120),
        empresa: linha(d.empresa, 160),
        email,
        telefone,
        celular: celular(telefone),
        interesse: linha(d.interesse, 80),
        assunto: linha(d.assunto, 80),
        cargo: linha(d.cargo, 120),
        erp: linha(d.erp, 40),
        faturamento: linha(d.faturamento, 60),
        mensagem: texto(d.mensagem).trim().slice(0, 2000),
        formulario: linha(d.origem_formulario, 40) || (consultiva ? 'solicite-sua-proposta' : ''),
        pagina: linha(d.pagina, 300),
        utm: {},
    };
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        if (linha(d[k])) lead.utm[k] = linha(d[k], 120);
    }
    lead.emailValido = EMAIL.test(lead.email);
    lead.newsletter = !lead.nome && lead.assunto !== '';

    // Recusa silenciosa: campo-isca preenchido, envio rápido demais (o "t" é o tempo na página, em
    // ms), sondagem, página forjada ou e-mail descartável. Quem manda isso é robô.
    const tudo = Object.values(d).map((v) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : texto(v)).join(' ');
    const t = Number(texto(d.t));
    // O Digital manda só o caminho (/contato.html); a Consultiva manda location.href do próprio site.
    const paginaForjada = lead.pagina !== '' && (consultiva
        ? !/^https:\/\/(www\.)?axxiscontabilidade\.com\.br\/[a-z0-9\-_.\/?=&%+#~,]*$/i.test(lead.pagina)
        : !/^\/[a-z0-9\-_.\/]*$/i.test(lead.pagina));

    let spam = '';
    if (linha(d.website) !== '') spam = 'campo-isca preenchido';
    else if (t > 0 && t < 2500) spam = 'enviado rápido demais';
    else if (SONDAGEM.test(tudo)) spam = 'sondagem ou injeção no conteúdo';
    else if (paginaForjada) spam = 'página de origem forjada';
    else if (DESCARTAVEL.test(lead.email)) spam = 'e-mail descartável';

    // Recusa com aviso: o que uma pessoa de verdade erra.
    let motivo = '';
    if (lead.newsletter) {
        if (!lead.emailValido) motivo = 'Informe um e-mail válido.';
    } else if (lead.nome.length < 2) {
        motivo = 'Informe seu nome.';
    } else if (!lead.emailValido && !lead.celular) {
        motivo = 'Informe um e-mail ou celular válido.';
    } else if (consultiva && !['true', 'on', '1', 'sim'].includes(linha(d.consentimento).toLowerCase())) {
        motivo = 'É preciso autorizar o contato.';
    }

    return { ...lead, spam, motivo };
}

module.exports = { validar, celular, SITES };
