// O AVISO DO LEAD POR E-MAIL
//
// Um e-mail para o comercial a cada lead, dizendo se ele entrou no 4C ou se precisa ser cadastrado
// à mão. Sai pela mesma caixa Skymail que a Central usa (SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS no painel de deploy), com cópia para tecnologia@ — regra de toda automação da Axxis.
//
// SMTP_PASS é a senha de uma caixa de verdade: nunca entra em log nem em resposta. Este
// repositório é público.
//
// Tudo que veio do formulário é escapado antes de entrar no HTML: sem isso, quem preenche o
// formulário escreve o e-mail que o comercial recebe (link falso, imagem, etc.).

'use strict';

const nodemailer = require('nodemailer');

const PARA = () => String(process.env.LEAD_EMAIL_PARA || 'comercial@grupoaxxis.com.br').trim();
const COPIA = () => String(process.env.LEAD_EMAIL_COPIA || 'tecnologia@grupoaxxis.com.br').trim();
const configurado = () => ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every((k) => String(process.env[k] || '').trim());

let transporte = null;
function transportador() {
    if (transporte) return transporte;
    const porta = Number.parseInt(process.env.SMTP_PORT, 10) || 465;
    transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port: porta,
        // 465 fala TLS desde o primeiro byte; 587 negocia depois, e aí o STARTTLS é obrigatório
        // para a senha nunca atravessar a rede legível.
        secure: porta === 465,
        requireTLS: porta !== 465,
        auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS.trim() },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
    });
    return transporte;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const semQuebra = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

function montar(lead, crm, quando) {
    const whats = lead.celular ? `https://wa.me/55${lead.celular}` : '';
    const linhas = [
        ['Nome', lead.nome],
        ['Empresa', lead.empresa],
        ['Cargo', lead.cargo],
        ['WhatsApp', lead.telefone],
        ['E-mail', lead.email],
        ['Interesse', lead.interesse || lead.assunto],
        ['Usa ERP?', lead.erp],
        ['Faturamento', lead.faturamento],
        ['Mensagem', lead.mensagem],
        ['Formulário', [lead.formulario, lead.pagina].filter(Boolean).join(' · ')],
        ['Campanha', Object.values(lead.utm).join(' · ')],
    ].filter(([, v]) => v);

    const status = crm.ok
        ? `Entrou no 4C: FUNIL ATIVO › PROSPECÇÃO, com o Kesller${crm.existente ? ' (o cliente já existia no 4C, ganhou um negócio novo)' : ''}.`
        : `ATENÇÃO: este lead NÃO entrou no 4C — ${crm.erro}. Cadastre à mão.`;
    const cor = crm.ok ? '#1a7f37' : '#b54708';

    const celula = 'padding:10px 14px; border-bottom:1px solid #e6e9ee; font-size:14px; vertical-align:top;';
    const tabela = linhas.map(([r, v]) => `<tr><td style="${celula} width:130px; background:#f8f9fb; color:#6b7280; font-size:13px;">${esc(r)}</td>`
        + `<td style="${celula} color:#1f2937; word-break:break-word;">${esc(v).replace(/\r?\n/g, '<br>')}</td></tr>`).join('');
    const titulo = lead.newsletter ? 'Nova inscrição na newsletter do blog' : `Novo lead pelo site ${lead.siteNome}`;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0; padding:24px; background:#ffffff; font-family:'Segoe UI', Arial, sans-serif; color:#1f2937;">
<div style="max-width:560px;">
  <div style="font-size:12px; letter-spacing:1.4px; text-transform:uppercase; color:#e87524; margin-bottom:6px;">Site ${esc(lead.siteNome)}</div>
  <div style="font-size:20px; font-weight:600; color:#111b35; margin-bottom:14px;">${esc(titulo)}</div>
  <p style="font-size:14px; margin:0 0 16px; padding:10px 12px; border-left:3px solid ${cor}; color:${cor}; font-weight:600;">${esc(status)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e9ee; border-collapse:collapse; margin-bottom:18px;">${tabela}</table>
  ${whats ? `<p style="margin:0 0 18px;"><a href="${esc(whats)}" style="display:inline-block; background:#25D366; color:#fff; text-decoration:none; padding:10px 18px; border-radius:4px; font-size:13px; font-weight:600;">Chamar no WhatsApp</a></p>` : ''}
  <p style="font-size:12px; color:#999; margin:0;">Recebido em ${esc(quando)}.</p>
</div></body></html>`;

    const textoSimples = [titulo, status, '', ...linhas.map(([r, v]) => `${r}: ${v}`), whats && `WhatsApp: ${whats}`, `Recebido em ${quando}.`].filter((x) => x !== false && x != null).join('\n');
    const quem = semQuebra(lead.empresa || lead.nome || lead.email).slice(0, 80);
    const assunto = `${crm.ok ? '' : '[NÃO ENTROU NO 4C] '}[Lead site ${lead.siteNome}] ${quem}`;
    return { html, texto: textoSimples, assunto };
}

/** Envia o aviso. Devolve { ok } ou { ok: false, erro } — o erro nunca contém a senha. */
async function avisar(lead, crm, quando) {
    if (!configurado()) return { ok: false, erro: 'SMTP não configurado no servidor do site' };
    const m = montar(lead, crm, quando);
    try {
        await transportador().sendMail({
            from: { name: 'Site Axxis', address: String(process.env.SMTP_REMETENTE_EMAIL || process.env.SMTP_USER).trim() },
            to: PARA(),
            cc: COPIA() || undefined,
            replyTo: lead.emailValido ? lead.email : undefined,
            subject: m.assunto,
            text: m.texto,
            html: m.html,
        });
        return { ok: true };
    } catch (err) {
        return { ok: false, erro: `${err.code || err.name || 'erro'} ${err.responseCode || ''}`.trim() };
    }
}

module.exports = { avisar, montar, configurado };
