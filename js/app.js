/* 
   DUETO — app.js  v1.0 */

// ── 1. Firebase config (preencher depois) ──────────────────
const firebaseConfig = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO",
  storageBucket:     "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID"
};

// ── 2. Service worker (PWA) ────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then(() => console.log("[Dueto] Service worker ok"))
      .catch(err => console.warn("[Dueto] SW falhou:", err));
  });
}

// TODO: descomentar após instalar o SDK do Firebase
// import { initializeApp } from "firebase/app";
// import { getAuth }        from "firebase/auth";
// import { getFirestore }   from "firebase/firestore";
// const app  = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const db   = getFirestore(app);

// ── 3. Navegação entre telas ───────────────────────────────
function navegar(id) {
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
  document.getElementById('tela-' + id).classList.add('ativa');
}

// ── Constantes globais ─────────────────────────────────────
const TOAST_DURACAO_MS = 2800;

// ── 4. Toast — global, único para todas as telas ──────────
function mostrarToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), TOAST_DURACAO_MS);
}

// ── 5. Lógica das telas ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ════════════════════════════════════════════════════════
  // TELA DE LOGIN
  // ════════════════════════════════════════════════════════

  function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    // TODO: auth.signInWithEmailAndPassword(email, senha)
    mostrarToast('entrando...');
  }

  function irParaCadastro() {
    navegar('cadastro');
  }

  function loginGoogle() {
    // TODO: const provider = new GoogleAuthProvider();
    //       auth.signInWithPopup(provider);
    mostrarToast('login com Google em breve');
  }

  function abrirRecuperarSenha() {
    const email = document.getElementById('email').value;
    if (email) document.getElementById('emailRecuperar').value = email;
    document.getElementById('modalRecuperar').classList.add('open');
  }

  function fecharModal() {
    document.getElementById('modalRecuperar').classList.remove('open');
  }

  function fecharModalFora(e) {
    if (e.target === document.getElementById('modalRecuperar')) fecharModal();
  }

  function enviarRecuperacao() {
    const email = document.getElementById('emailRecuperar').value;
    if (!email) return;
    // TODO: auth.sendPasswordResetEmail(email)
    fecharModal();
    mostrarToast('link enviado para ' + email);
  }

  // ════════════════════════════════════════════════════════
  // TELA DE CADASTRO
  // ════════════════════════════════════════════════════════

  let etapaAtual = 0;
  let avatarSelecionado = '🌸';
  let corSelecionada = '#E8849A';
  let parceiroConectado = false;

  const titulos = ['criar conta', 'seu perfil', 'conectar parceiro', ''];

  function avancar(etapa, pular = false) {
    if (etapa === 0) {
      const nome  = document.getElementById('nome').value.trim();
      const email = document.getElementById('emailCadastro').value.trim();
      const senha = document.getElementById('senhaCadastro').value;
      const conf  = document.getElementById('confirmar').value;
      if (!nome)            { mostrarToast('insira seu nome'); return; }
      if (!email)           { mostrarToast('insira seu e-mail'); return; }
      if (senha.length < 6) { mostrarToast('senha muito curta'); return; }
      if (senha !== conf)   { mostrarToast('as senhas não coincidem'); return; }
      document.getElementById('previewNome').textContent = nome;
    }

    const proxima = etapa + 1;
    document.getElementById('step' + etapa).classList.remove('visible');
    document.getElementById('step' + proxima).classList.add('visible');
    atualizarDots(proxima);
    etapaAtual = proxima;

    document.getElementById('topTitle').textContent = titulos[proxima] || '';

    if (proxima === 3) prepararSucesso(pular);
  }

  function atualizarDots(etapa) {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('dot' + i);
      dot.className = 'step-dot';
      if (i < etapa)   dot.classList.add('done');
      if (i === etapa) dot.classList.add('active');
    }
  }

  function voltarCadastro() {
    if (etapaAtual === 0) {
      navegar('login');
      return;
    }
    document.getElementById('step' + etapaAtual).classList.remove('visible');
    const anterior = etapaAtual - 1;
    document.getElementById('step' + anterior).classList.add('visible');
    atualizarDots(anterior);
    etapaAtual = anterior;
    document.getElementById('topTitle').textContent = titulos[anterior];
  }

  function validarEmailCadastro() {
    const input = document.getElementById('emailCadastro');
    const hint  = document.getElementById('emailHint');
    const val   = input.value.trim();
    if (!val) { input.className = 'input'; hint.textContent = ''; return; }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    input.className  = ok ? 'input ok' : 'input error';
    hint.className   = ok ? 'field-hint ok' : 'field-hint error';
    hint.textContent = ok ? 'e-mail válido' : 'formato inválido';
  }

  function verificarForca() {
    const senha = document.getElementById('senhaCadastro').value;
    const fill  = document.getElementById('strengthFill');
    const hint  = document.getElementById('senhaHint');
    let forca = 0;
    if (senha.length >= 6)          forca++;
    if (senha.length >= 10)         forca++;
    if (/[A-Z]/.test(senha))        forca++;
    if (/[0-9]/.test(senha))        forca++;
    if (/[^A-Za-z0-9]/.test(senha)) forca++;

    const pct    = Math.min(forca * 20, 100);
    const cores  = ['', '#F87171', '#F59E0B', '#F59E0B', '#7ABA7A', '#7ABA7A'];
    const textos = ['', 'muito fraca', 'fraca', 'razoável', 'boa', 'forte'];

    fill.style.width      = pct + '%';
    fill.style.background = cores[forca] || '#3A1F2E';
    hint.textContent      = forca > 0 ? 'força: ' + textos[forca] : '';
    hint.style.color      = cores[forca] || 'var(--color-text-tertiary)';
  }

  function verificarConfirmacao() {
    const senha = document.getElementById('senhaCadastro').value;
    const conf  = document.getElementById('confirmar').value;
    const input = document.getElementById('confirmar');
    const hint  = document.getElementById('confirmarHint');
    if (!conf) { input.className = 'input'; hint.textContent = ''; return; }
    const ok = senha === conf;
    input.className  = ok ? 'input ok' : 'input error';
    hint.className   = ok ? 'field-hint ok' : 'field-hint error';
    hint.textContent = ok ? 'senhas conferem' : 'senhas diferentes';
  }

  function selecionarAvatar(el) {
    document.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    avatarSelecionado = el.dataset.emoji;
    document.getElementById('previewAvatar').textContent = avatarSelecionado;
    document.getElementById('successAvatar').textContent = avatarSelecionado;
  }

  function selecionarCor(el) {
    document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    corSelecionada = el.dataset.color;
    document.getElementById('previewAvatar').style.background = corSelecionada + '26';
  }

  function gerarCodigo() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return 'DU·' + n;
  }

  function copiarCodigo() {
    const code = document.getElementById('inviteCode').textContent;
    navigator.clipboard.writeText(code).catch(() => {});
    mostrarToast('código copiado: ' + code);
  }

  function formatarCodigo(input) {
    let v = input.value.toUpperCase().replace(/[^A-Z0-9·]/g, '');
    if (v.length >= 2 && !v.includes('·')) v = v.slice(0, 2) + '·' + v.slice(2);
    input.value = v.slice(0, 7);
  }

  function verificarParceiro() {
    const codigo = document.getElementById('codigoParceiro').value;
    if (codigo.length < 7) { mostrarToast('código incompleto'); return; }
    // TODO: buscar no Firestore pelo código
    const nomes = ['Ana', 'João', 'Maria', 'Pedro', 'Lara', 'Lucas'];
    const nome  = nomes[Math.floor(Math.random() * nomes.length)];
    document.getElementById('partnerName').textContent = nome + ' encontrado — pronto para conectar';
    document.getElementById('partnerFound').classList.add('show');
    parceiroConectado = true;
  }

  function prepararSucesso(pulou) {
    const nome = document.getElementById('nome').value.trim();
    document.getElementById('nomeSuccesso').textContent = nome ? ', ' + nome + '!' : '!';
    if (parceiroConectado && !pulou) {
      document.getElementById('successConexao').textContent = 'parceiro conectado';
      document.getElementById('successConexaoIcon').innerHTML =
        '<circle cx="7" cy="7" r="5.5" stroke="#7ABA7A" stroke-width="1.2"/>' +
        '<path d="M4.5 7l2 2 3-3" stroke="#7ABA7A" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>';
    }
  }

  function irParaHome() {
    navegar('home');
  }

  function cadastroGoogle() {
    // TODO: const provider = new GoogleAuthProvider(); auth.signInWithPopup(provider);
    mostrarToast('cadastro com Google em breve');
  }

  // Gerar código de convite ao carregar
  const inviteEl = document.getElementById('inviteCode');
  if (inviteEl) inviteEl.textContent = gerarCodigo();

  // ════════════════════════════════════════════════════════
  // TELA HOME
  // ════════════════════════════════════════════════════════

  let tarefasConcluidas = 1;
  const totalTarefas = 3;

  function atualizarProgresso() {
    const fill  = document.getElementById('progressFill');
    const count = document.getElementById('progressCount');
    if (!fill || !count) return; // evita erro se elemento não existe
    const pct = Math.round((tarefasConcluidas / totalTarefas) * 100);
    fill.style.width  = pct + '%';
    count.textContent = tarefasConcluidas + ' de ' + totalTarefas;
  }
  function toggleTask(item) {
    const check = item.querySelector('.task-check');
    const name  = item.querySelector('.task-item__name');
    const done  = check.classList.contains('done');

    if (done) {
      check.classList.remove('done');
      check.innerHTML = '';
      name.classList.remove('done');
      tarefasConcluidas = Math.max(0, tarefasConcluidas - 1);
    } else {
      check.classList.add('done');
      check.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="#E8849A" stroke-width="1.3" stroke-linecap="round"/></svg>';
      name.classList.add('done');
      tarefasConcluidas = Math.min(totalTarefas, tarefasConcluidas + 1);
      mostrarToast('tarefa concluída — aguardando validação');
    }
    atualizarProgresso();
  }


  function verParceiro() {
    mostrarToast('perfil do parceiro — em breve');
  }

  function irParaTarefas() { navegar('tarefas'); inicializarTarefas(); }

 function irParaExercicios() { navegar('exercicios'); inicializarExercicios(); }

  function irParaLoja() {
    navegar('loja'); // TODO: criar tela da loja
  }

  // Saudação dinâmica por hora
  const saudacaoEl = document.querySelector('.home-header__sub');
  if (saudacaoEl) {
    const h = new Date().getHours();
    saudacaoEl.textContent = h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
  }

  // ════════════════════════════════════════════════════════
  // TELA DE TAREFAS
  // ════════════════════════════════════════════════════════

  let pontosSelecionados = 15;

  function toggleGrupo(grupo) {
    const body    = document.getElementById('body-' + grupo);
    const chevron = document.getElementById('chevron-' + grupo);
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    chevron.classList.toggle('open', !isOpen);
  }

  function filtrarTipo(btn) {
    document.querySelectorAll('.tarefas-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    // TODO: filtrar tarefas pelo tipo quando vier do Firebase
  }

function toggleTaskHome(item) {
  const check = item.querySelector('.task-check');
  const name  = item.querySelector('.task-item__name');
  const pts   = parseInt(item.dataset.pts) || 0;
  const done  = check.classList.contains('done');
  if (done) {
    check.classList.remove('done');
    check.innerHTML = '';
    name.classList.remove('done');
    atualizarSaldo(-pts);
  } else {
    check.classList.add('done');
    check.innerHTML = '<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="#E8849A" stroke-width="1.3" stroke-linecap="round"/></svg>';
    name.classList.add('done');
    atualizarSaldo(pts);
    mostrarToast('+' + pts + ' moedas');
  }
  if (item.dataset.grupo) atualizarBadgeGrupo(item.dataset.grupo);
}

  function atualizarSaldo(delta) {
  const el = document.getElementById('saldoVal');
  if (!el) return;
  const atual = parseInt(el.textContent) || 0;
  el.textContent = Math.max(0, atual + delta);
  // TODO: salvar no Firestore
}

  function atualizarBadgeGrupo(grupo) {
    const body  = document.getElementById('body-' + grupo);
    const badge = document.getElementById('badge-' + grupo);
    if (!body || !badge) return;
    const total      = body.querySelectorAll('.task-item').length;
    const concluidas = body.querySelectorAll('.task-check.done').length;
    badge.textContent = concluidas + '/' + total;
    badge.classList.toggle('completo', concluidas === total && total > 0);
  }

  function inicializarBadges() {
    ['limpeza', 'pets', 'organizacao'].forEach(atualizarBadgeGrupo);
  }

  function atualizarResumoDia() {
    const el = document.getElementById('tarefasResumoDia');
    if (!el) return;
    const todas      = document.querySelectorAll('#tarefasLista .task-item').length;
    const concluidas = document.querySelectorAll('#tarefasLista .task-check.done').length;
    el.textContent   = concluidas + ' de ' + todas + ' hoje';
  }

  function abrirModalNovaTarefa() {
    document.getElementById('modalNovaTarefa').classList.add('open');
    document.getElementById('novaTarefaNome').focus();
  }

  function fecharModalNovaTarefa() {
    document.getElementById('modalNovaTarefa').classList.remove('open');
    document.getElementById('novaTarefaNome').value = '';
    document.querySelectorAll('.pts-opt').forEach(o => o.classList.remove('active'));
    const defaultOpt = document.querySelector('.pts-opt[data-pts="15"]');
    if (defaultOpt) defaultOpt.classList.add('active');
    pontosSelecionados = 15;
  }

  function fecharModalNovaTarefaFora(e) {
    if (e.target === document.getElementById('modalNovaTarefa')) fecharModalNovaTarefa();
  }

  function selecionarPontos(btn) {
    document.querySelectorAll('.pts-opt').forEach(o => o.classList.remove('active'));
    btn.classList.add('active');
    pontosSelecionados = parseInt(btn.dataset.pts);
  }

  function criarTarefa() {
    const nome  = document.getElementById('novaTarefaNome').value.trim();
    const grupo = document.getElementById('novaTarefaGrupo').value;
    if (!nome) { mostrarToast('dê um nome para a tarefa'); return; }

    const item = document.createElement('div');
    item.className     = 'task-item';
    item.dataset.pts   = pontosSelecionados;
    item.dataset.grupo = grupo;
    item.onclick = function() { toggleTaskHome(this); atualizarResumoDia(); };
    item.innerHTML = `
      <div class="task-check"></div>
      <div class="task-item__info">
        <div class="task-item__name">${nome}</div>
      </div>
      <span class="task-item__pts">+${pontosSelecionados}</span>
    `;

    const body = document.getElementById('body-' + grupo);
    if (body) {
      body.appendChild(item);
      body.classList.add('open');
      document.getElementById('chevron-' + grupo)?.classList.add('open');
    }

    atualizarBadgeGrupo(grupo);
    atualizarResumoDia();
    fecharModalNovaTarefa();
    mostrarToast('tarefa criada em ' + grupo);
    // TODO: salvar no Firestore
  }

  function inicializarTarefas() {
    inicializarBadges();
    atualizarResumoDia();
  }

  const exEstado = {
  streakVoce:     12,
  streakParceiro: 10,
  metaDias:       30,
  feitoHoje:      false,   // TODO: verificar data do último check-in no Firestore
  historico: [
    // true = feito, false = perdido, null = futuro
    true,true,true,true,true,
    true,true,true,true,true,
    true,true,false,false,true,
    true,true,true,true,true,
    true,true,true,true,true,
    true,true,true,true,true,
    true
  ]
};
 
const DIAS_SEMANA = ['D','S','T','Q','Q','S','S'];
 
function inicializarExercicios() {
  atualizarStreaks();
  atualizarMeta();
  renderizarCalendarioSemanal();
  renderizarHistoricoMensal();
  atualizarBotaoCheckin();
}
 
function atualizarStreaks() {
  const elVoce     = document.getElementById('streakVoce');
  const elParceiro = document.getElementById('streakParceiro');
  if (elVoce)     elVoce.textContent     = exEstado.streakVoce;
  if (elParceiro) elParceiro.textContent = exEstado.streakParceiro;
}
 
function atualizarMeta() {
  const fill    = document.getElementById('exProgressFill');
  const pct     = document.getElementById('exProgressPct');
  const label   = document.getElementById('exMetaLabel');
  const sub     = document.getElementById('exMetaSub');
  if (!fill) return;
 
  const progresso  = Math.min(exEstado.streakVoce, exEstado.metaDias);
  const porcentagem = Math.round((progresso / exEstado.metaDias) * 100);
  const faltam     = exEstado.metaDias - progresso;
 
  fill.style.width  = porcentagem + '%';
  if (pct)   pct.textContent   = porcentagem + '%';
  if (label) label.textContent = exEstado.metaDias + ' dias seguidos';
  if (sub)   sub.textContent   = faltam > 0
    ? 'faltam ' + faltam + ' dias para bater a meta'
    : '🎉 meta batida!';
}
 
function renderizarCalendarioSemanal() {
  const container = document.getElementById('exCalRow');
  if (!container) return;
 
  const hoje    = new Date();
  const diaSem  = hoje.getDay(); // 0 = domingo
  const inicio  = new Date(hoje);
  inicio.setDate(hoje.getDate() - diaSem); // domingo desta semana
 
  container.innerHTML = '';
 
  for (let i = 0; i < 7; i++) {
    const dia  = new Date(inicio);
    dia.setDate(inicio.getDate() + i);
    const isHoje   = dia.toDateString() === hoje.toDateString();
    const isFuturo = dia > hoje;
    const isFeitoHoje = isHoje && exEstado.feitoHoje;
 
    let dotClass = 'ex-cal-day__dot';
    let conteudo = '';
 
    if (isFuturo) {
      dotClass += ' ex-cal-day__dot--future';
    } else if (isHoje) {
      dotClass += isFeitoHoje ? ' ex-cal-day__dot--done' : ' ex-cal-day__dot--today';
      conteudo = isFeitoHoje
        ? '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 5l2 2 3-3" stroke="#E8849A" stroke-width="1.3" stroke-linecap="round"/></svg>'
        : dia.getDate();
    } else {
      // dias anteriores — checar no histórico simplificado
      const idx = exEstado.historico[dia.getDate() - 1];
      dotClass += idx === false ? ' ex-cal-day__dot--miss' : ' ex-cal-day__dot--done';
      conteudo = idx === false
        ? '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 3l4 4M7 3L3 7" stroke="#F87171" stroke-width="1.3" stroke-linecap="round"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 5l2 2 3-3" stroke="#E8849A" stroke-width="1.3" stroke-linecap="round"/></svg>';
    }
 
    container.innerHTML += `
      <div class="ex-cal-day">
        <span class="ex-cal-day__label">${DIAS_SEMANA[i]}</span>
        <div class="${dotClass}">${conteudo}</div>
      </div>`;
  }
}
 
function renderizarHistoricoMensal() {
  const grid  = document.getElementById('exHistoryGrid');
  const count = document.getElementById('exHistoryCount');
  if (!grid) return;
 
  const hoje        = new Date();
  const diasNoMes   = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diaAtual    = hoje.getDate();
  const totalFeitos = exEstado.historico.slice(0, diaAtual).filter(Boolean).length;
 
  if (count) count.textContent = totalFeitos + ' de ' + diaAtual + ' dias';
 
  grid.innerHTML = '';
  for (let d = 1; d <= diasNoMes; d++) {
    const isFuturo = d > diaAtual;
    const feito    = exEstado.historico[d - 1];
    let cls = 'ex-history-dot';
    if (isFuturo)       cls += ' ex-history-dot--future';
    else if (feito)     cls += ' ex-history-dot--done';
    else                cls += ' ex-history-dot--miss';
    grid.innerHTML += `<div class="${cls}" title="dia ${d}"></div>`;
  }
}
 
function atualizarBotaoCheckin() {
  const btn  = document.getElementById('exCheckinBtn');
  const done = document.getElementById('exCheckinDone');
  if (!btn || !done) return;
  btn.classList.toggle('is-hidden', exEstado.feitoHoje);
  done.classList.toggle('is-hidden', !exEstado.feitoHoje);
}
 
function fazerCheckin() {
  if (exEstado.feitoHoje) return;
 
  exEstado.feitoHoje = true;
  exEstado.streakVoce++;
 
  // Atualiza histórico do dia atual
  const diaAtual = new Date().getDate();
  exEstado.historico[diaAtual - 1] = true;
 
  atualizarStreaks();
  atualizarMeta();
  renderizarCalendarioSemanal();
  renderizarHistoricoMensal();
  atualizarBotaoCheckin();
 
  // Atualizar status na tela
  const status = document.getElementById('streakVoceStatus');
  if (status) {
    status.className = 'ex-streak-card__status';
    status.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4" stroke="#7ABA7A" stroke-width="1"/>
        <path d="M3 5l1.5 1.5L7 3.5" stroke="#7ABA7A" stroke-width="1" stroke-linecap="round"/>
      </svg>
      feito hoje`;
  }
 
  // Mostrar celebração
  mostrarCelebracao();
 
  // TODO: salvar check-in no Firestore
}
 
function mostrarCelebracao() {
  const overlay = document.getElementById('exCelebrate');
  const num     = document.getElementById('exCelebrateNum');
  const sub     = document.getElementById('exCelebrateSub');
  const emoji   = document.getElementById('exCelebrateEmoji');
  if (!overlay) return;
 
  if (num)   num.textContent   = exEstado.streakVoce;
  if (emoji) emoji.textContent = exEstado.streakVoce >= 30 ? '🏅' : exEstado.streakVoce >= 14 ? '⚡' : '🔥';
  if (sub) {
    if      (exEstado.streakVoce === exEstado.metaDias) sub.textContent = '🎉 você bateu a meta!';
    else if (exEstado.streakVoce % 7 === 0)             sub.textContent = 'mais uma semana completa!';
    else                                                sub.textContent = 'continue assim';
  }
 
  overlay.classList.add('show');
}
 
function fecharCelebracao() {
  document.getElementById('exCelebrate')?.classList.remove('show');
}
 
// ── Modal de meta ──────────────────────────────────────
 
let metaSelecionada = 30;
 
function abrirModalMeta() {
  document.getElementById('modalMeta').classList.add('open');
}
 
function fecharModalMeta() {
  document.getElementById('modalMeta').classList.remove('open');
}
 
function fecharModalMetaFora(e) {
  if (e.target === document.getElementById('modalMeta')) fecharModalMeta();
}
 
function selecionarMeta(btn) {
  document.querySelectorAll('.ex-meta-opt').forEach(o => o.classList.remove('active'));
  btn.classList.add('active');
  metaSelecionada = parseInt(btn.dataset.dias);
}
 
function salvarMeta() {
  exEstado.metaDias = metaSelecionada;
  fecharModalMeta();
  atualizarMeta();
  mostrarToast('meta atualizada: ' + metaSelecionada + ' dias');
  // TODO: salvar no Firestore
}

  // ════════════════════════════════════════════════════════
  // DELEGAÇÃO DE EVENTOS — substitui todos os onclick="" do HTML
  // ════════════════════════════════════════════════════════
  // ============================================================
  // DUETO — Bloco de delegação de eventos
  // SUBSTITUIR todo o bloco "// EXPOR FUNÇÕES AO HTML"
  // no final do DOMContentLoaded por este código.
  // ============================================================

  // Mapa de ações: cada data-action aponta para sua função
  const acoes = {
    // Login
    'abrir-recuperar':              () => abrirRecuperarSenha(),
    'ir-cadastro':                  () => irParaCadastro(),
    'login-google':                 () => loginGoogle(),
    'fechar-modal-recuperar':       () => fecharModal(),
    'fechar-modal-recuperar-fora':  (el, e) => fecharModalFora(e),
    'enviar-recuperacao':           () => enviarRecuperacao(),

    // Cadastro
    'voltar-cadastro':              () => voltarCadastro(),
    'cadastro-google':              () => cadastroGoogle(),
    'copiar-codigo':                () => copiarCodigo(),
    'verificar-parceiro':           () => verificarParceiro(),
    'avancar':                      (el) => avancar(parseInt(el.dataset.etapa), el.dataset.pular === 'true'),
    'selecionar-avatar':            (el) => selecionarAvatar(el),
    'selecionar-cor':               (el) => selecionarCor(el),

    // Home / navegação
    'ver-parceiro':                 () => verParceiro(),
    'ir-home':                      () => irParaHome(),
    'ir-tarefas':                   () => irParaTarefas(),
    'ir-exercicios':                () => irParaExercicios(),
    'ir-loja':                      () => irParaLoja(),
    'toast':                        (el) => mostrarToast(el.dataset.msg),

    // Tarefas
    'toggle-grupo':                 (el) => toggleGrupo(el.dataset.grupo),
    'toggle-task':                  (el) => toggleTaskHome(el),
    'filtrar-tipo':                 (el) => filtrarTipo(el),
    'abrir-nova-tarefa':            () => abrirModalNovaTarefa(),
    'fechar-nova-tarefa':           () => fecharModalNovaTarefa(),
    'fechar-nova-tarefa-fora':      (el, e) => fecharModalNovaTarefaFora(e),
    'selecionar-pontos':            (el) => selecionarPontos(el),
    'criar-tarefa':                 () => criarTarefa(),

    // Exercícios
    'abrir-meta':                   () => abrirModalMeta(),
    'fechar-meta':                  () => fecharModalMeta(),
    'fechar-meta-fora':             (el, e) => fecharModalMetaFora(e),
    'selecionar-meta':              (el) => selecionarMeta(el),
    'salvar-meta':                  () => salvarMeta(),
    'fazer-checkin':                () => fazerCheckin(),
    'fechar-celebracao':            () => fecharCelebracao(),
  };

  // Delegação única de cliques — captura todos os data-action
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-action]');
    if (!alvo) return;
    const acao = acoes[alvo.dataset.action];
    if (acao) acao(alvo, e);
  });

  // Form do login — submit dedicado
  const formLogin = document.getElementById('form-login');
  if (formLogin) formLogin.addEventListener('submit', handleLogin);

});