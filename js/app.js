/* 
   DUETO — app.js  v2.0 — Firebase integrado */

// ── Imports do Firebase (via CDN — sem bundler necessário) ──
import {
  iniciarAuthListener, loginEmail, loginComGoogle,
  recuperarSenha, cadastrarEmail,
  criarPerfil, buscarPorCodigo, conectarParceiro,
  criarTarefaDB, excluirTarefaDB, marcarTarefaDB, ouvirTarefas,
  criarTarefaSoloDB, excluirTarefaSoloDB, marcarTarefaSoloDB, ouvirTarefasSolo,
  salvarExercicioDB, ouvirExercicios,
  criarItemLojaDB, excluirItemLojaDB,
  resgatarItemDB, confirmarResgateCasalDB, ouvirLoja,
  adicionarSaldoDB, atualizarSaldoUsuarioDB, ouvirSaldo,
  atualizarAvatar,
  ouvirParceiro, buscarProgressoParceiroHoje,
  fazerCheckinDB,
  adicionarLugarDB, adicionarLugarSoloDB,
  excluirLugarDB, excluirLugarSoloDB,
  adicionarAoCofrinhoDb, adicionarAoCofrinhoSoloDB,
  ouvirLugares, ouvirLugaresSolo,
  adicionarReceitaDB, adicionarReceitaSoloDB,
  excluirReceitaDB, excluirReceitaSoloDB,
  ouvirReceitas, ouvirReceitasSolo,
  adicionarFilmeDB, adicionarFilmeSoloDB,
  marcarFilmeAssistidoDB, marcarFilmeAssistidoSoloDB,
  avaliarFilmeDB, avaliarFilmeSoloDB,
  excluirFilmeDB, excluirFilmeSoloDB,
  ouvirFilmes, ouvirFilmesSolo,
  resetarProgressoDB,
  logout
} from './firebase.js';

// ── Service worker (PWA) ────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then(() => console.log("[Dueto] Service worker ok"))
      .catch(err => console.warn("[Dueto] SW falhou:", err));
  });
}

// ── Estado global Firebase ──────────────────────────────────
let _fbUid    = null;  // uid do usuário logado
let _fbCasalId = null; // id do casal no Firestore
let _unsubTarefas    = null;
let _unsubLoja       = null;
let _unsubSaldo      = null;
let _unsubParceiro   = null;
let _unsubFilmes     = null;
let _unsubReceitas   = null;
let _unsubLugares    = null;
let _parceiroUidEncontrado = null;
let _tarefasSnapshot = null;
let _nomePartner     = 'parceiro';
let _avatarPartner   = null;

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
let _statsAno = new Date().getFullYear();
let _statsMes = new Date().getMonth() + 1;

// Retorna 'YYYY-MM-DD' no fuso local do dispositivo (evita bug UTC em UTC-x)
function _dataLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Avatar helper ─────────────────────────────────────────────
function _htmlAvatar(avatar) {
  if (avatar && (avatar.startsWith('https://') || avatar.startsWith('http://') || avatar.startsWith('data:'))) {
    return `<img src="${avatar}" alt="avatar" class="avatar-foto">`;
  }
  return `<i class="ph ${avatar || 'ph-user'}" aria-hidden="true"></i>`;
}

function _aplicarAvatarUI(avatar) {
  const html = _htmlAvatar(avatar);
  ['previewAvatar', 'successAvatar', 'perfilAvatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
  const myAvatar = document.querySelector('.my-avatar');
  if (myAvatar) myAvatar.innerHTML = html;
}

// ── Histórico interno de navegação (botão voltar) ───────────
let _navStack     = [];
let _poppingState = false;

// ── Notificações ─────────────────────────────────────────────
const _notificacoesEnviadas = new Set();
let   _lembreteInterval     = null;

// ── Sistema de notificações in-app ─────────────────────────
const _notificacoes = [];
let   _notifIdCounter = 0;

const _notifIcons = {
  tarefa:      'ph-check-circle',
  loja:        'ph-storefront',
  'loja-compra': 'ph-shopping-cart',
  filme:       'ph-film-slate',
  receita:     'ph-fork-knife',
  lugar:       'ph-map-pin',
};

function _pushNotificacao(tipo, titulo, texto) {
  _notificacoes.unshift({ id: ++_notifIdCounter, tipo, titulo, texto, lida: false, ts: Date.now() });
  _atualizarBadgeSino();
  mostrarNotificacaoPush(titulo, texto);
}

function _atualizarBadgeSino() {
  const badge = document.getElementById('sinoBadge');
  if (!badge) return;
  const n = _notificacoes.filter(x => !x.lida).length;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.classList.toggle('is-hidden', n === 0);
}

function _notifTempo(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return min + 'min';
  const h = Math.floor(min / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function _renderNotificacoes() {
  const lista = document.getElementById('notificacoesLista');
  if (!lista) return;
  if (_notificacoes.length === 0) {
    lista.innerHTML = `<div class="notif-empty"><i class="ph ph-bell-slash" aria-hidden="true"></i><span>nenhuma notificação ainda</span></div>`;
    return;
  }
  lista.innerHTML = _notificacoes.map(n => {
    const icon = _notifIcons[n.tipo] || 'ph-bell';
    return `<div class="notif-item ${n.lida ? '' : 'notif-item--nova'}" role="listitem">
      <div class="notif-item__icone"><i class="ph-bold ${icon}" aria-hidden="true"></i></div>
      <div class="notif-item__corpo">
        <div class="notif-item__titulo">${n.titulo}</div>
        <div class="notif-item__texto">${n.texto}</div>
        <div class="notif-item__tempo">${_notifTempo(n.ts)}</div>
      </div>
    </div>`;
  }).join('');
}

function abrirModalNotificacoes() {
  _notificacoes.forEach(n => { n.lida = true; });
  _atualizarBadgeSino();
  _renderNotificacoes();
  abrirModal('modalNotificacoes');
}

function fecharModalNotificacoes() { fecharModal('modalNotificacoes'); }

function limparNotificacoes() {
  _notificacoes.length = 0;
  _atualizarBadgeSino();
  _renderNotificacoes();
}

function _ocultarLoading() {
  document.getElementById('appLoading')?.classList.add('hidden');
}

async function solicitarNotificacao() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function mostrarNotificacaoPush(titulo, corpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: corpo, icon: './assets/icons/apple-touch-icon.png', tag: 'dueto', renotify: true };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification(titulo, opts))
      .catch(() => new Notification(titulo, opts));
  } else {
    new Notification(titulo, opts);
  }
}

function _verificarLembreteDiario() {
  const lista = document.getElementById('homeTarefasList');
  if (!lista) return;
  const total    = lista.querySelectorAll('.task-item').length;
  const feitas   = lista.querySelectorAll('.task-check.done').length;
  const pendentes = total - feitas;
  if (pendentes > 0) {
    mostrarNotificacaoPush(
      'Dueto — tarefas do dia',
      `Você tem ${pendentes} tarefa${pendentes > 1 ? 's' : ''} pendente${pendentes > 1 ? 's' : ''} hoje`
    );
  }
}

function _iniciarLembrete() {
  if (_lembreteInterval) clearInterval(_lembreteInterval);
  _lembreteInterval = setInterval(_verificarLembreteDiario, 4 * 60 * 60 * 1000);
}

// ── 3. Navegação entre telas ───────────────────────────────
function navegar(id) {
  const tela = document.getElementById('tela-' + id);
  if (!tela) { mostrarToast('em breve'); return; }
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
  tela.classList.add('ativa');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.action === 'ir-' + id);
    b.setAttribute('aria-current', b.dataset.action === 'ir-' + id ? 'page' : 'false');
  });

  if (!_poppingState) {
    // Telas raiz resetam o histórico; demais empilham
    if (id === 'home' || id === 'login' || id === 'cadastro') {
      _navStack = [id];
    } else {
      _navStack.push(id);
    }
    history.pushState({ dueto: id }, '');
  }
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
// ============================================================
// LOJA — estado e funções
// ============================================================

// Estado persistido em localStorage (TODO: Firestore na Fase 2)
const LOJA_KEY = 'dueto_loja';

const ITENS_DEFAULT = { individuais: [], casal: [] };

let lojaEstado = carregarLoja();
let lojaAbaAtiva = 'individuais';
let tipoItemSelecionado = 'individuais';
let itemResgatandoId = null;
let saldoAtual = 0;

function carregarLoja() {
  try {
    const raw = localStorage.getItem(LOJA_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(ITENS_DEFAULT));
  } catch {
    return JSON.parse(JSON.stringify(ITENS_DEFAULT));
  }
}

function salvarLoja() {
  localStorage.setItem(LOJA_KEY, JSON.stringify(lojaEstado));
}

// ── Inicialização ────────────────────────────────────────────
function inicializarLoja() {
  lojaAbaAtiva = 'individuais';
  tipoItemSelecionado = 'individuais';

  // Atualizar saldo no header da loja
  const saldoEl = document.getElementById('lojaSaldo');
  if (saldoEl) saldoEl.textContent = saldoAtual;

  renderizarLoja();
  ativarAbaLoja('individuais');
}

// ── Abas ────────────────────────────────────────────────────
function ativarAbaLoja(aba) {
  lojaAbaAtiva = aba;
  document.querySelectorAll('.loja-tab').forEach(t => {
    const bate = t.dataset.aba === aba;
    t.classList.toggle('active', bate);
    t.setAttribute('aria-selected', bate);
  });
  const desc = document.getElementById('lojaDesc');
  if (desc) {
    desc.textContent = aba === 'individuais'
      ? 'recompensas só suas — pagas com seu saldo'
      : 'recompensas para os dois — cada um contribui metade';
  }
  renderizarLoja();
}

// ── Renderização ─────────────────────────────────────────────
function renderizarLoja() {
  const lista = document.getElementById('lojaLista');
  if (!lista) return;

  const itens = lojaEstado[lojaAbaAtiva] || [];

  if (itens.length === 0) {
    lista.innerHTML = `
      <li class="loja-vazia">
        <i class="ph ph-storefront" aria-hidden="true"></i>
        <span>nenhum item ainda</span>
        <span class="loja-vazia__sub">toque em + para adicionar</span>
      </li>`;
    return;
  }

  lista.innerHTML = itens.map(item => {
    if (lojaAbaAtiva === 'individuais') {
      return renderItemIndividual(item);
    } else {
      return renderItemCasal(item);
    }
  }).join('');
}

function renderItemIndividual(item) {
  const resgatado = _itemResgatadoAtivo(item);
  const horas = resgatado ? _horasRestantes(item) : 0;
  return `
    <li class="loja-item ${resgatado ? 'loja-item--resgatado' : ''}"
        data-id="${item.id}" aria-label="${item.nome}">
      <div class="loja-item__info">
        <span class="loja-item__nome">${item.nome}</span>
        <span class="loja-item__custo">
          <i class="ph ph-coin" aria-hidden="true"></i> ${item.custo}
        </span>
      </div>
      <div class="loja-item__actions">
        ${resgatado
          ? `<span class="loja-item__tag loja-item__tag--wait">
               <i class="ph ph-hourglass" aria-hidden="true"></i> disponível em ${horas}h
             </span>`
          : `<button class="loja-item__btn" data-action="iniciar-resgatar"
                     data-id="${item.id}" aria-label="Resgatar ${item.nome}">
               resgatar
             </button>`
        }
        <button class="loja-item__del" data-action="excluir-item"
                data-id="${item.id}" aria-label="Excluir ${item.nome}">
          <i class="ph ph-trash" aria-hidden="true"></i>
        </button>
      </div>
    </li>`;
}

function renderItemCasal(item) {
  const voceConfirmou = item.confirmadoPor.includes('voce');
  const parceiroConfirmou = item.confirmadoPor.includes('parceiro');
  const resgatado = voceConfirmou && parceiroConfirmou;
  const aguardando = voceConfirmou && !parceiroConfirmou;
  const metade = Math.ceil(item.custo / 2);

  let statusHtml = '';
  if (resgatado) {
    statusHtml = `<span class="loja-item__tag loja-item__tag--done">
      <i class="ph ph-check-circle" aria-hidden="true"></i> resgatado
    </span>`;
  } else if (aguardando) {
    statusHtml = `<span class="loja-item__tag loja-item__tag--wait">
      <i class="ph ph-hourglass" aria-hidden="true"></i> aguardando parceiro
    </span>`;
  } else {
    statusHtml = `<button class="loja-item__btn" data-action="iniciar-resgatar-casal"
                          data-id="${item.id}" aria-label="Resgatar ${item.nome}">
      resgatar
    </button>`;
  }

  return `
    <li class="loja-item ${resgatado ? 'loja-item--resgatado' : ''} ${aguardando ? 'loja-item--aguardando' : ''}"
        data-id="${item.id}" aria-label="${item.nome}">
      <div class="loja-item__info">
        <span class="loja-item__nome">${item.nome}</span>
        <div class="loja-item__custo-casal">
          <i class="ph ph-coin" aria-hidden="true"></i>
          <span>${item.custo} total</span>
          <span class="loja-item__metade">(${metade} cada)</span>
        </div>
      </div>
      <div class="loja-item__actions">
        ${statusHtml}
        <button class="loja-item__del" data-action="excluir-item"
                data-id="${item.id}" aria-label="Excluir ${item.nome}">
          <i class="ph ph-trash" aria-hidden="true"></i>
        </button>
      </div>
    </li>`;
}

const MS_24H = 24 * 60 * 60 * 1000;
function _itemResgatadoAtivo(item) {
  return !!item.resgatadoEm && (Date.now() - item.resgatadoEm) < MS_24H;
}
function _horasRestantes(item) {
  if (!item.resgatadoEm) return 0;
  return Math.ceil((item.resgatadoEm + MS_24H - Date.now()) / 3600000);
}

// ── Resgatar individual ───────────────────────────────────────
function iniciarResgatar(id) {
  const item = lojaEstado.individuais.find(i => i.id === id);
  if (!item || _itemResgatadoAtivo(item)) return;
  if (saldoAtual < item.custo) {
    mostrarToast('saldo insuficiente');
    return;
  }
  itemResgatandoId = id;
  document.getElementById('resgatarCusto').textContent = item.custo;
  abrirModal('modalResgatar');
}

async function confirmarResgatar() {
  const item = lojaEstado.individuais.find(i => i.id === itemResgatandoId);
  if (!item) return;
  if (saldoAtual < item.custo) { mostrarToast('saldo insuficiente'); return; }
  try {
    if (_fbCasalId && _fbUid) {
      await resgatarItemDB(_fbCasalId, _fbUid, item.id, item.custo);
    } else {
      item.resgatadoEm = Date.now();
      delete item.resgatado;
      saldoAtual -= item.custo;
      salvarLoja();
      atualizarSaldo();
      renderizarLoja();
      if (_fbUid) await atualizarSaldoUsuarioDB(_fbUid, -item.custo);
    }
    fecharModalResgatar();
    mostrarToast('recompensa resgatada! 🎉');
  } catch (err) {
    mostrarToast('erro ao resgatar: ' + err.message);
  }
}

function fecharModalResgatar() {
  fecharModal('modalResgatar');
  itemResgatandoId = null;
}

// ── Resgatar casal ────────────────────────────────────────────
function iniciarResgatarCasal(id) {
  const item = lojaEstado.casal.find(i => i.id === id);
  if (!item) return;
  const metade = Math.ceil(item.custo / 2);
  if (saldoAtual < metade) {
    mostrarToast('saldo insuficiente para sua parte');
    return;
  }
  itemResgatandoId = id;

  // Atualizar status no modal
  const voceConfirmou = item.confirmadoPor.includes('voce');
  const parceiroConfirmou = item.confirmadoPor.includes('parceiro');

  document.getElementById('resgatarCasalMetade').textContent = metade;
  document.getElementById('casalStatusVoce').innerHTML =
    `<i class="ph ${voceConfirmou ? 'ph-check-circle' : 'ph-circle'}" aria-hidden="true"></i><span>você</span>`;
  document.getElementById('casalStatusParceiro').innerHTML =
    `<i class="ph ${parceiroConfirmou ? 'ph-check-circle' : 'ph-circle'}" aria-hidden="true"></i><span>parceiro</span>`;

  document.getElementById('casalStatusVoce').classList.toggle('loja-casal-status__item--done', voceConfirmou);
  document.getElementById('casalStatusParceiro').classList.toggle('loja-casal-status__item--done', parceiroConfirmou);

  abrirModal('modalResgatarCasal');
}

function confirmarResgatarCasal() {
  const item = lojaEstado.casal.find(i => i.id === itemResgatandoId);
  if (!item) return;

  if (!item.confirmadoPor.includes('voce')) {
    item.confirmadoPor.push('voce');
    saldoAtual -= Math.ceil(item.custo / 2);
    atualizarSaldo();
  }

  // Simular parceiro confirmando (TODO: Firebase)
  const ambosConfirmaram = item.confirmadoPor.length >= 2;
  salvarLoja();
  fecharResgatarCasal();
  renderizarLoja();
  mostrarToast(ambosConfirmaram ? 'recompensa resgatada por vocês dois!' : 'confirmado — aguardando parceiro');
}

function fecharResgatarCasal() {
  fecharModal('modalResgatarCasal');
  itemResgatandoId = null;
}

// ── Excluir item ─────────────────────────────────────────────
async function excluirItem(id) {
  try {
    if (_fbCasalId) {
      await excluirItemLojaDB(_fbCasalId, id);
    } else {
      lojaEstado.individuais = lojaEstado.individuais.filter(i => i.id !== id);
      lojaEstado.casal       = lojaEstado.casal.filter(i => i.id !== id);
      salvarLoja();
      renderizarLoja();
    }
    mostrarToast('item removido');
  } catch (err) {
    mostrarToast('erro: ' + err.message);
  }
}

// ── Adicionar item ────────────────────────────────────────────
function abrirNovoItem() {
  tipoItemSelecionado = 'individuais';
  document.querySelectorAll('[data-tipo-item]').forEach(b => {
    b.classList.toggle('active', b.dataset.tipoItem === 'individuais');
  });
  document.getElementById('novoItemNome').value = '';
  document.getElementById('novoItemCusto').value = 100;
  abrirModal('modalNovoItem');
}

function fecharNovoItem() {
  fecharModal('modalNovoItem');
}

function fecharNovoItemFora(e) {
  if (e.target === document.getElementById('modalNovoItem')) fecharNovoItem();
}

function selecionarTipoItem(btn) {
  tipoItemSelecionado = btn.dataset.tipoItem;
  document.querySelectorAll('[data-tipo-item]').forEach(b => {
    b.classList.toggle('active', b.dataset.tipoItem === tipoItemSelecionado);
  });
}

function ajustarItemCusto(delta) {
  const input = document.getElementById('novoItemCusto');
  if (!input) return;
  const novo = Math.max(10, Math.min(9999, (parseInt(input.value) || 100) + delta));
  input.value = novo;
}

async function salvarNovoItem() {
  const nome  = document.getElementById('novoItemNome').value.trim();
  const custo = parseInt(document.getElementById('novoItemCusto').value) || 100;
  if (!nome) { mostrarToast('dê um nome ao item'); return; }
  try {
    if (_fbCasalId && _fbUid) {
      await criarItemLojaDB(_fbCasalId, _fbUid, { nome, custo, tipo: tipoItemSelecionado });
    } else {
      const id = tipoItemSelecionado[0] + Date.now();
      if (tipoItemSelecionado === 'individuais') {
        lojaEstado.individuais.push({ id, nome, custo, resgatado: false });
      } else {
        lojaEstado.casal.push({ id, nome, custo, confirmadoPor: [] });
      }
      salvarLoja();
      renderizarLoja();
    }
    fecharNovoItem();
    if (lojaAbaAtiva !== tipoItemSelecionado) ativarAbaLoja(tipoItemSelecionado);
    mostrarToast('item adicionado');
  } catch (err) {
    mostrarToast('erro: ' + err.message);
  }
}

function atualizarSaldo() {
  document.querySelectorAll('#saldoVal, #lojaSaldo').forEach(el => {
    if (el) el.textContent = saldoAtual;
  });
  const badge = document.getElementById('lojaBadgeSaldo');
  if (badge) badge.textContent = saldoAtual + ' moedas';
}



// Controla overflow do app-shell para modais não serem cortados no desktop
function abrirModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.querySelector('.app-shell')?.classList.add('modal-open');
}
function fecharModal(id) {
  document.getElementById(id)?.classList.remove('open');
  const temModalAberto = document.querySelector('.modal-backdrop.open, .modal--bottom.open');
  if (!temModalAberto) {
    document.querySelector('.app-shell')?.classList.remove('modal-open');
  }
}

// ── Modal de confirmação de exclusão ─────────────────────────
let acaoPendente = null;

function abrirModalConfirmar(titulo, desc, callback) {
  document.getElementById('confirmarTitulo').textContent = titulo;
  document.getElementById('confirmarDesc').textContent   = desc;
  acaoPendente = callback;
  abrirModal('modalConfirmar');
}

function fecharModalConfirmar() {
  fecharModal('modalConfirmar');
  acaoPendente = null;
}

function confirmarExclusao() {
  if (acaoPendente) acaoPendente();
  fecharModalConfirmar();
}


// ── Perfil e logout ─────────────────────────────────────────
let _dadosPerfilAtual = null; // cache local dos dados do usuário

function _autenticado() {
  if (!_fbUid) { navegar('login'); return false; }
  return true;
}

function irParaPerfil() {
  if (!_autenticado()) return;
  navegar('perfil');
  _atualizarTelaPerfil();
}

function _atualizarTelaPerfil() {
  if (!_dadosPerfilAtual) return;
  const d = _dadosPerfilAtual;
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('perfilNome',   d.nome   || 'você');
  setText('perfilEmail',  d.email  || '—');
  setText('perfilCodigo', d.codigo || 'DU·----');

  // Avatar
  const avatarEl = document.getElementById('perfilAvatar');
  if (avatarEl && d.avatar) {
    avatarEl.innerHTML = _htmlAvatar(d.avatar);
  }

  // Status do parceiro
  const parceiroEl = document.getElementById('perfilParceiro');
  if (parceiroEl) {
    if (d.parceiroUid) {
      parceiroEl.innerHTML = `
        <i class="ph ph-user-circle-check" aria-hidden="true"></i>
        <span>conectado</span>
      `;
      parceiroEl.classList.add('conectado');
    } else {
      parceiroEl.innerHTML = `
        <i class="ph ph-user-circle-dashed" aria-hidden="true"></i>
        <span>nenhum parceiro conectado</span>
      `;
      parceiroEl.classList.remove('conectado');
    }
  }
}

async function copiarCodigoPerfil() {
  const codigo = document.getElementById('perfilCodigo')?.textContent;
  if (!codigo || codigo === 'DU·----') return;
  try {
    await navigator.clipboard.writeText(codigo);
    mostrarToast('código copiado!');
  } catch {
    mostrarToast('erro ao copiar');
  }
}

async function resetarProgresso() {
  fecharModal('modalReset');
  try {
    const parceiroUid = _dadosPerfilAtual?.parceiroUid || null;
    await resetarProgressoDB(_fbCasalId, _fbUid, parceiroUid);
    mostrarToast('progresso zerado!');
  } catch (err) {
    mostrarToast('erro ao resetar: ' + err.message);
  }
}

async function fazerLogout() {
  fecharModal('modalLogout');
  _fbUid     = null;
  _fbCasalId = null;
  _unsubTarefas?.();  _unsubTarefas  = null;
  _unsubLoja?.();     _unsubLoja     = null;
  _unsubSaldo?.();    _unsubSaldo    = null;
  _unsubParceiro?.(); _unsubParceiro = null;
  _unsubFilmes?.();    _unsubFilmes   = null;
  _unsubReceitas?.();  _unsubReceitas = null;
  _unsubLugares?.();   _unsubLugares  = null;
  navegar('login');
  try {
    await logout();
  } catch (err) {
    mostrarToast('erro ao sair: ' + err.message);
  }
}

// ── Formatador do código de parceiro (cadastro) ─────────────
function formatarCodigoParceiro(input) {
  let val = input.value.toUpperCase().replace(/[^A-Z0-9·]/g, '');
  // Garantir prefixo DU·
  if (!val.startsWith('DU·') && val.length > 0) {
    val = 'DU·' + val.replace(/^DU·?/i, '');
  }
  // Limitar a 7 caracteres (DU·XXXX)
  if (val.length > 7) val = val.substring(0, 7);
  input.value = val;
}


document.addEventListener('DOMContentLoaded', () => {

  // Segurança: esconde loading após 5s mesmo sem resposta do auth
  setTimeout(_ocultarLoading, 5000);

  // ── Auth Listener: gerencia sessão automaticamente ──────────
  iniciarAuthListener(
    async (user, dados) => {
      _fbUid    = user.uid;
      _fbCasalId = dados?.casalId || null;

      if (dados) {
        // Cachear dados para a tela de perfil
        _dadosPerfilAtual = { ...dados, email: user.email };

        // Atualizar UI com dados do usuário
        const nome = dados.nome || 'você';
        const homeNome    = document.getElementById('homeNome');
        const profileNome = document.getElementById('profileNome');
        if (homeNome)    homeNome.textContent    = nome;
        if (profileNome) profileNome.textContent = nome;

        const avatarEl = document.getElementById('myAvatar') || document.querySelector('.my-avatar');
        if (avatarEl && dados.avatar) {
          avatarEl.innerHTML = _htmlAvatar(dados.avatar);
        }

        saldoAtual = dados.saldo || 0;
        atualizarSaldo();

        // Carregar estado de exercícios persistido
        const hojeISO = _dataLocal();
        exEstado.feitoHoje  = dados.ultimoCheckin === hojeISO;
        let streakBase      = dados.streakAtual || 0;
        if (!exEstado.feitoHoje && dados.ultimoCheckin) {
          const ontem = new Date();
          ontem.setDate(ontem.getDate() - 1);
          if (dados.ultimoCheckin < ontem.toISOString().split('T')[0]) {
            streakBase = 0; // streak quebrado — dia pulado
          }
        }
        exEstado.streakVoce = streakBase;
        if (exEstado.feitoHoje) {
          exEstado.historico[new Date().getDate() - 1] = true;
        }

        // Ouvir saldo SEMPRE — independente de ter casal
        _unsubSaldo?.();
        _unsubSaldo = ouvirSaldo(user.uid, (saldo) => {
          saldoAtual = saldo;
          atualizarSaldo();
        });

        // Iniciar listeners (casal ou solo)
        _iniciarListeners(dados.casalId || null, user.uid);

        // Notificações
        solicitarNotificacao();
        _iniciarLembrete();

        // Ir para home se estiver no login ou cadastro
        const telaAtiva = document.querySelector('.tela.ativa');
        if (!telaAtiva || telaAtiva.id === 'tela-login' || telaAtiva.id === 'tela-cadastro') {
          irParaHome();
        }
        _ocultarLoading();
      } else {
        // Usuário logado mas sem perfil — ir para cadastro
        _ocultarLoading();
        const isGoogle = user.providerData.some(p => p.providerId === 'google.com');
        navegar('cadastro');
        if (isGoogle) {
          // Conta já criada via Google — pular Step 0 e pré-preencher nome
          window._uidCadastro  = user.uid;
          window._nomeCadastro = user.displayName || '';
          document.getElementById('step0').classList.remove('visible');
          document.getElementById('step1').classList.add('visible');
          // Mostrar campo de nome editável no Step 1
          const nomeGoogleField = document.getElementById('nomeGoogleField');
          const nomeGoogleInput = document.getElementById('nomeGoogle');
          if (nomeGoogleField) nomeGoogleField.style.display = '';
          if (nomeGoogleInput) nomeGoogleInput.value = window._nomeCadastro;
          const previewNome = document.getElementById('previewNome');
          if (previewNome && window._nomeCadastro) previewNome.textContent = window._nomeCadastro;
          atualizarDots(1);
          etapaAtual = 1;
          document.getElementById('topTitle').textContent = titulos[1] || '';
        }
      }
    },
    () => {
      // Deslogado — mostrar login
      _fbUid = null;
      _fbCasalId = null;
      _dadosPerfilAtual = null;
      _pararListeners();
      _unsubSaldo?.();    _unsubSaldo    = null;
      _unsubParceiro?.(); _unsubParceiro = null;
      if (_lembreteInterval) { clearInterval(_lembreteInterval); _lembreteInterval = null; }
      _limparTarefasTelas();
      _ocultarLoading();
      navegar('login');
    }
  );

  // ── Listeners Firestore em tempo real ───────────────────────

  function _renderLojaFirestore(snap) {
    // Reconstruir lojaEstado a partir do Firestore
    lojaEstado.individuais = [];
    lojaEstado.casal = [];
    snap.forEach(docSnap => {
      const d  = docSnap.data();
      const id = docSnap.id;
      if (d.tipo === 'individuais') {
        lojaEstado.individuais.push({
          id, nome: d.nome, custo: d.custo,
          resgatadoEm: d.resgatadoEm || null
        });
      } else {
        lojaEstado.casal.push({
          id, nome: d.nome, custo: d.custo,
          confirmadoPor: d.confirmadoPor || []
        });
      }
    });
    // Re-renderizar se a loja estiver aberta
    if (document.querySelector('#tela-loja.ativa')) {
      renderizarLoja();
      const saldoEl = document.getElementById('lojaSaldo');
      if (saldoEl) saldoEl.textContent = saldoAtual;
    }
  }

  function _limparTarefasTelas() {
    const homeLista = document.getElementById('homeTarefasList');
    if (homeLista) homeLista.innerHTML = '';
    ['limpeza','pets','organizacao','roupas','outros','cozinha','banheiro'].forEach(g => {
      const body = document.getElementById('body-' + g);
      if (body) body.innerHTML = '';
    });
  }

  function atualizarProgressoHome() {
    const lista = document.getElementById('homeTarefasList');
    const total  = lista ? lista.querySelectorAll('.task-item:not(.is-hidden)').length : 0;
    const feitas = lista ? lista.querySelectorAll('.task-item:not(.is-hidden) .task-check.done').length : 0;
    totalTarefas      = total;
    tarefasConcluidas = feitas;
    atualizarProgresso();
    const pendEl = document.getElementById('homePendentes');
    if (pendEl) {
      const pend = total - feitas;
      pendEl.textContent = total === 0 ? '' : pend > 0 ? `${pend} pendente${pend > 1 ? 's' : ''}` : 'tudo feito!';
    }
  }

  function _iniciarListeners(casalId, uid) {
    _pararListeners();
    _limparTarefasTelas();

    // Loja em tempo real (só para casais)
    if (casalId) {
      let _lojaInicializada = false;
      const _lojaResgatadosVistos = new Set();
      _unsubLoja = ouvirLoja(casalId, (snap) => {
        if (!_lojaInicializada) {
          snap.docs.forEach(d => {
            const data = d.data();
            if (data.resgatadoPor) _lojaResgatadosVistos.add(d.id + '-resg');
            (data.confirmadoPor || []).forEach(u => _lojaResgatadosVistos.add(d.id + '-conf-' + u));
          });
          _lojaInicializada = true;
        } else {
          const parceiroUid = _dadosPerfilAtual?.parceiroUid;
          snap.docChanges().forEach(change => {
            const data = change.doc.data();
            const did  = change.doc.id;
            if (change.type === 'added' && parceiroUid && data.criadoPor !== uid) {
              _pushNotificacao('loja', 'nova recompensa na loja', `parceiro adicionou "${data.nome}"`);
            } else if (change.type === 'modified' && parceiroUid) {
              const keyResg = did + '-resg';
              if (data.resgatadoPor === parceiroUid && !_lojaResgatadosVistos.has(keyResg)) {
                _lojaResgatadosVistos.add(keyResg);
                _pushNotificacao('loja-compra', 'recompensa resgatada', `parceiro resgatou "${data.nome}"`);
              }
              const keyConf = did + '-conf-' + parceiroUid;
              if (data.confirmadoPor?.includes(parceiroUid) && !_lojaResgatadosVistos.has(keyConf)) {
                _lojaResgatadosVistos.add(keyConf);
                _pushNotificacao('loja-compra', 'compra confirmada', `parceiro confirmou "${data.nome}"`);
              }
            }
          });
        }
        _renderLojaFirestore(snap);
      });
    }

    // Tarefas em tempo real — casal ou solo
    const ouvirFn = casalId
      ? (cb) => ouvirTarefas(casalId, cb)
      : (cb) => ouvirTarefasSolo(uid, cb);

    let tarefasInicializadas = false;

    _unsubTarefas = ouvirFn((snap) => {
      _tarefasSnapshot = snap;
      snap.docChanges().forEach(change => {
        const { doc, type } = change;
        if (type === 'added') {
          _renderTarefaFirestore(doc, uid);
        } else if (type === 'removed') {
          document.querySelectorAll(`[data-task-id="${doc.id}"]`).forEach(el => el.remove());
        } else if (type === 'modified') {
          const hoje        = _dataLocal();
          const docData     = doc.data();
          const concluidaPor = docData.concluidaPor || {};
          const parceiroUid = _dadosPerfilAtual?.parceiroUid;
          const euFiz       = concluidaPor[uid] === hoje;
          const alguemFez   = euFiz || (parceiroUid && concluidaPor[parceiroUid] === hoje);

          // Para pontual: verificar se está dentro do prazo
          const proxDataStr = docData.proxData ? docData.proxData.substring(0, 10) : hoje;
          const pontualDue  = docData.tipo !== 'pontual' || proxDataStr <= hoje;

          // Notificar quando o parceiro concluir (apenas após carga inicial)
          if (tarefasInicializadas && parceiroUid && concluidaPor[parceiroUid] === hoje && !euFiz) {
            const notifKey = `${doc.id}-${parceiroUid}-${hoje}`;
            if (!_notificacoesEnviadas.has(notifKey)) {
              _notificacoesEnviadas.add(notifKey);
              _pushNotificacao('tarefa', 'tarefa concluída', `parceiro concluiu "${docData.nome}"`);
            }
          }

          document.querySelectorAll(`[data-task-id="${doc.id}"]`).forEach(el => {
            // Atualiza proxData no data attribute
            el.dataset.proxData = docData.proxData || '';

            const check = el.querySelector('.task-check');
            const name  = el.querySelector('.task-item__name');
            if (!check || !name) return;

            const isHome = !!el.closest('#homeTarefasList');

            // Visibilidade no home para tarefas pontuais
            if (isHome && docData.tipo === 'pontual') {
              el.classList.toggle('is-hidden', !pontualDue);
            }

            // Home: done se qualquer um completou; Tarefas: done só se EU completei
            const feito  = isHome ? alguemFez : euFiz;
            check.classList.toggle('done', feito);
            check.innerHTML = feito ? '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>' : '';
            name.classList.toggle('done', feito);
          });
        }
      });
      tarefasInicializadas = true;
      atualizarProgressoHome();
      atualizarResumoDia();
      inicializarBadges();
    });

    // Filmes em tempo real — casal ou solo
    const ouvirFilmesFn = casalId
      ? (cb) => ouvirFilmes(casalId, cb)
      : (cb) => ouvirFilmesSolo(uid, cb);

    let _filmesInicializado = false;
    _unsubFilmes = ouvirFilmesFn((snap) => {
      if (_filmesInicializado && casalId) {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.adicionadoPor !== uid) {
              _pushNotificacao('filme', 'novo filme na lista', `parceiro adicionou "${data.titulo}"`);
            }
          }
        });
      }
      _filmesInicializado = true;
      _filmesLista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.querySelector('#tela-filmes.ativa')) _renderFilmesLista();
    });

    // Receitas em tempo real — casal ou solo
    const ouvirReceitasFn = casalId
      ? (cb) => ouvirReceitas(casalId, cb)
      : (cb) => ouvirReceitasSolo(uid, cb);

    let _receitasInicializado = false;
    _unsubReceitas = ouvirReceitasFn((snap) => {
      if (_receitasInicializado && casalId) {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.adicionadoPor !== uid) {
              _pushNotificacao('receita', 'nova receita adicionada', `parceiro adicionou "${data.nome}"`);
            }
          }
        });
      }
      _receitasInicializado = true;
      _receitasLista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.querySelector('#tela-receitas.ativa')) _renderReceitasLista();
    });

    // Lugares em tempo real — casal ou solo
    const ouvirLugaresFn = casalId
      ? (cb) => ouvirLugares(casalId, cb)
      : (cb) => ouvirLugaresSolo(uid, cb);

    let _lugaresInicializado = false;
    _unsubLugares = ouvirLugaresFn((snap) => {
      if (_lugaresInicializado && casalId) {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.adicionadoPor !== uid) {
              _pushNotificacao('lugar', 'novo lugar na lista', `parceiro adicionou "${data.nome}"`);
            }
          }
        });
      }
      _lugaresInicializado = true;
      _lugaresLista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.querySelector('#tela-lugares.ativa')) _renderLugaresLista();
    });
  }

  function _pararListeners() {
    _unsubTarefas?.();
    _unsubLoja?.();
    _unsubFilmes?.();
    _unsubReceitas?.();
    _unsubTarefas  = null;
    _unsubLoja     = null;
    _unsubFilmes   = null;
    _unsubReceitas = null;
    _unsubLugares?.(); _unsubLugares = null;
  }

  function _renderTarefaFirestore(docSnap, uid) {
    const dados = docSnap.data();
    const id    = docSnap.id;

    const hoje        = _dataLocal();
    const parceiroUid = _dadosPerfilAtual?.parceiroUid;
    const euFiz       = dados.concluidaPor?.[uid] === hoje;
    const alguemFez   = euFiz || (parceiroUid && dados.concluidaPor?.[parceiroUid] === hoje);
    const tagTexto  = dados.tipo === 'pontual'
      ? `a cada ${dados.ciclo} dia${dados.ciclo > 1 ? 's' : ''}`
      : 'diária';

    // Tarefa pontual está pendente apenas se proxData <= hoje
    const proxDataStr = dados.proxData ? dados.proxData.substring(0, 10) : hoje;
    const pontualDue  = dados.tipo !== 'pontual' || proxDataStr <= hoje;

    // ── Tela de tarefas ────────────────────────────────────────
    const body = document.getElementById('body-' + dados.grupo);
    if (body && !body.querySelector(`[data-task-id="${id}"]`)) {
      const item = document.createElement('div');
      item.className      = 'task-item';
      item.dataset.taskId = id;
      item.dataset.grupo  = dados.grupo;
      item.dataset.tipo   = dados.tipo;
      item.dataset.ciclo  = dados.ciclo || '';
      item.dataset.proxData = dados.proxData || '';
      item.dataset.action = 'toggle-task';
      item.innerHTML = `
        <div class="task-check ${euFiz ? 'done' : ''}">${euFiz ? '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>' : ''}</div>
        <div class="task-item__info">
          <div class="task-item__name ${euFiz ? 'done' : ''}">${dados.nome}</div>
          <div class="task-item__tag">${tagTexto}</div>
        </div>
        <button class="task-item__del" data-action="excluir-tarefa"
                data-task-id="${id}" aria-label="Excluir tarefa">
          <i class="ph ph-trash" aria-hidden="true"></i>
        </button>
      `;
      body.appendChild(item);
      body.classList.add('open');
      document.getElementById('chevron-' + dados.grupo)?.classList.add('open');
    }

    // ── Home — lista resumida ──────────────────────────────────
    const homeLista = document.getElementById('homeTarefasList');
    if (homeLista && !homeLista.querySelector(`[data-task-id="${id}"]`)) {
      const homeItem = document.createElement('div');
      homeItem.className      = 'task-item';
      homeItem.dataset.taskId = id;
      homeItem.dataset.grupo  = dados.grupo;
      homeItem.dataset.tipo   = dados.tipo;
      homeItem.dataset.ciclo  = dados.ciclo || '';
      homeItem.dataset.proxData = dados.proxData || '';
      homeItem.dataset.action = 'toggle-task';
      if (!pontualDue) homeItem.classList.add('is-hidden');
      homeItem.innerHTML = `
        <div class="task-check ${alguemFez ? 'done' : ''}">${alguemFez ? '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>' : ''}</div>
        <div class="task-item__info">
          <div class="task-item__name ${alguemFez ? 'done' : ''}">${dados.nome}</div>
          <div class="task-item__tag">${tagTexto}</div>
        </div>
      `;
      homeLista.appendChild(homeItem);
    }
  }



  // ════════════════════════════════════════════════════════
  // TELA DE LOGIN
  // ════════════════════════════════════════════════════════

  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    if (!email || !senha) { mostrarToast('preencha e-mail e senha'); return; }
    try {
      mostrarToast('entrando...');
      await loginEmail(email, senha);
      // onAuthStateChanged redireciona automaticamente
    } catch (err) {
      const msgs = {
        'auth/invalid-credential': 'e-mail ou senha incorretos',
        'auth/user-not-found':     'usuário não encontrado',
        'auth/wrong-password':     'senha incorreta',
        'auth/too-many-requests':  'muitas tentativas — tente mais tarde',
      };
      mostrarToast(msgs[err.code] || 'erro ao entrar');
    }
  }

  function irParaCadastro() {
    navegar('cadastro');
  }

  async function loginGoogle() {
    try {
      await loginComGoogle();
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      const msgs = {
        'auth/popup-blocked':        'popup bloqueado — libere popups para este site',
        'auth/unauthorized-domain':  'domínio não autorizado no Firebase Console',
        'auth/operation-not-allowed':'login com Google não ativado no Firebase Console',
      };
      mostrarToast(msgs[err.code] || 'erro Google: ' + err.code);
    }
  }

  function abrirRecuperarSenha() {
    const email = document.getElementById('email').value;
    if (email) document.getElementById('emailRecuperar').value = email;
    document.getElementById('modalRecuperar').classList.add('open');
  }

  function fecharModalRecuperar() {
    document.getElementById('modalRecuperar').classList.remove('open');
  }

  function fecharModalFora(e) {
    if (e.target === document.getElementById('modalRecuperar')) fecharModalRecuperar();
  }

  function toggleSenha(btn) {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    const icone = btn.querySelector('i');
    if (icone) icone.className = mostrar ? 'ph ph-eye-slash' : 'ph ph-eye';
    btn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
  }

  function enviarRecuperacao() {
    const email = document.getElementById('emailRecuperar').value;
    if (!email) return;
    // TODO: auth.sendPasswordResetEmail(email)
    fecharModalRecuperar();
    mostrarToast('link enviado para ' + email);
  }

  // ════════════════════════════════════════════════════════
  // TELA DE CADASTRO
  // ════════════════════════════════════════════════════════

  let etapaAtual = 0;
  let avatarSelecionado = 'ph-flower';
  let corSelecionada = '#FF2B00';
  let parceiroConectado = false;

  const titulos = ['criar conta', 'seu perfil', 'conectar parceiro', ''];

  async function avancar(etapa, pular = false) {
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
      // ── Firebase Auth: criar usuário ──
      try {
        const user = await cadastrarEmail(email, senha);
        window._uidCadastro  = user.uid;
        window._nomeCadastro = nome;
      } catch (err) {
        const msgs = {
          'auth/email-already-in-use': 'e-mail já cadastrado',
          'auth/weak-password':        'senha muito fraca',
          'auth/invalid-email':        'e-mail inválido',
        };
        mostrarToast(msgs[err.code] || 'erro no cadastro');
        return;
      }
    }

    // ── Etapa 1 → 2: salvar perfil (avatar + cor) no Firestore ──
    if (etapa === 1) {
      // Se veio do Google, o nome pode ter sido editado no campo do Step 1
      const nomeEditado = document.getElementById('nomeGoogle')?.value.trim();
      if (nomeEditado) window._nomeCadastro = nomeEditado;
      if (!window._nomeCadastro) { mostrarToast('insira seu nome'); return; }
      try {
        const uid = window._uidCadastro || _fbUid;
        if (uid) {
          const codigo = await criarPerfil(uid, {
            nome:   window._nomeCadastro,
            avatar: avatarSelecionado,
            cor:    corSelecionada
          });
          const codeEl = document.getElementById('inviteCode');
          if (codeEl) codeEl.textContent = codigo;
        }
      } catch (err) { console.error('Erro ao salvar perfil:', err); }
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
    const cores  = ['', '#FF6B5B', '#DB8E02', '#DB8E02', '#7ABA7A', '#7ABA7A'];
    const textos = ['', 'muito fraca', 'fraca', 'razoável', 'boa', 'forte'];

    fill.style.width      = pct + '%';
    fill.style.background = cores[forca] || '#2A1B12';
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

  // ── Listeners de validação do cadastro ──────────────────────
  document.getElementById('emailCadastro')
    ?.addEventListener('input', validarEmailCadastro);
  document.getElementById('senhaCadastro')
    ?.addEventListener('input', verificarForca);
  document.getElementById('confirmar')
    ?.addEventListener('input', verificarConfirmacao);
  document.getElementById('nomeGoogle')
    ?.addEventListener('input', (e) => {
      const preview = document.getElementById('previewNome');
      if (preview) preview.textContent = e.target.value || 'seu nome';
    });

  // ── Formatação do código do parceiro ────────────────────────
  document.querySelector('[data-format="codigo"]')
    ?.addEventListener('input', (e) => formatarCodigoParceiro(e.target));
  document.getElementById('parceiroCodigoInput')
    ?.addEventListener('input', (e) => formatarCodigoParceiro(e.target));


  function selecionarAvatar(el) {
    document.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    avatarSelecionado = el.dataset.emoji;
    const preview = document.getElementById('previewAvatar');
    const success = document.getElementById('successAvatar');
    if (preview) preview.innerHTML = _htmlAvatar(avatarSelecionado);
    if (success) success.innerHTML = _htmlAvatar(avatarSelecionado);
  }

  function abrirUploadAvatar() {
    document.getElementById('avatarFileInput')?.click();
  }

  function _comprimirAvatar(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = ({ target: { result } }) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const MAX = 220;
          let w = img.width, h = img.height;
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function _handleAvatarFile(file) {
    const uid = _fbUid || window._uidCadastro;
    if (!uid) { mostrarToast('conclua o cadastro primeiro'); return; }
    if (!file?.type.startsWith('image/')) { mostrarToast('selecione uma imagem'); return; }

    // Preview imediato
    const blobUrl = URL.createObjectURL(file);
    _aplicarAvatarUI(blobUrl);
    avatarSelecionado = blobUrl;
    document.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));

    mostrarToast('salvando foto...');
    try {
      const dataUrl = await _comprimirAvatar(file);
      avatarSelecionado = dataUrl;
      _aplicarAvatarUI(dataUrl);
      await atualizarAvatar(uid, dataUrl);
      if (_dadosPerfilAtual) _dadosPerfilAtual.avatar = dataUrl;
      mostrarToast('foto salva!');
    } catch (err) {
      mostrarToast('erro ao salvar: ' + err.message);
      console.error(err);
    }
  }

  document.getElementById('avatarFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) _handleAvatarFile(file);
    e.target.value = '';
  });

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

  async function irParaParceiro() {
    if (!_autenticado()) return;
    navegar('parceiro');

    const temParceiro = !!_dadosPerfilAtual?.parceiroUid;
    const semEl = document.getElementById('parceiro-sem-conexao');
    const comEl = document.getElementById('parceiro-com-conexao');
    const tituloEl = document.getElementById('parceiro-titulo');

    if (semEl) semEl.style.display = temParceiro ? 'none' : '';
    if (comEl) comEl.style.display = temParceiro ? '' : 'none';
    if (tituloEl) tituloEl.textContent = temParceiro ? 'parceiro' : 'conectar parceiro';

    if (!temParceiro) {
      const codeEl = document.getElementById('parceiroMeuCodigo');
      if (codeEl) codeEl.textContent = _dadosPerfilAtual?.codigo || 'DU·----';
      _parceiroUidEncontrado = null;
      const foundEl = document.getElementById('parceiroEncontrado');
      const btnEl   = document.getElementById('btnConectarParceiro');
      if (foundEl) foundEl.style.display = 'none';
      if (btnEl)   btnEl.style.display   = 'none';
      return;
    }

    const parceiroUid = _dadosPerfilAtual.parceiroUid;
    _unsubParceiro?.();
    _unsubParceiro = ouvirParceiro(parceiroUid, _renderDadosParceiro);

    if (_fbCasalId) {
      try {
        const { total, concluidas, tarefasConcluidas } = await buscarProgressoParceiroHoje(_fbCasalId, parceiroUid);
        _renderProgressoParceiro(total, concluidas, tarefasConcluidas);
      } catch (err) { console.error(err); }
    }
  }

  function _renderDadosParceiro(dados) {
    _nomePartner   = dados.nome   || 'parceiro';
    _avatarPartner = dados.avatar || null;
    const avatarEl = document.getElementById('parceiroAvatar');
    if (avatarEl) avatarEl.innerHTML = _htmlAvatar(dados.avatar || 'ph-user');

    const nomeEl = document.getElementById('parceiroNome');
    if (nomeEl) nomeEl.textContent = dados.nome || 'parceiro';

    const saldoEl = document.getElementById('parceiroSaldo');
    if (saldoEl) saldoEl.textContent = dados.saldo || 0;

    const streakEl  = document.getElementById('parceiroStreak');
    const streakSub = document.getElementById('parceiroStreakSub');
    const streakVal = dados.streakAtual || 0;
    if (streakEl)  streakEl.textContent  = streakVal;
    if (streakSub) streakSub.textContent = streakVal > 0 ? 'ativo!' : '';
  }

  function _renderProgressoParceiro(total, concluidas, tarefasConcluidas = []) {
    const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    const fillEl  = document.getElementById('parceiroProgressFill');
    const countEl = document.getElementById('parceiroProgressCount');
    const pendEl  = document.getElementById('parceiroPendentes');
    const listaEl = document.getElementById('parceiroTarefasList');

    if (fillEl)  fillEl.style.width  = pct + '%';
    if (countEl) countEl.textContent = `${concluidas} de ${total}`;
    if (pendEl) {
      const pend = total - concluidas;
      pendEl.textContent = total === 0 ? ''
        : pend > 0 ? `${pend} pendente${pend > 1 ? 's' : ''}`
        : 'tudo feito!';
    }

    if (listaEl) {
      listaEl.innerHTML = tarefasConcluidas.map(t => `
        <div class="parceiro-tarefa-item">
          <i class="ph ph-check-circle parceiro-tarefa-item__check" aria-hidden="true"></i>
          <span class="parceiro-tarefa-item__nome">${t.nome}</span>
        </div>`).join('');
    }
  }

  async function verificarParceiroCodigo() {
    const input = document.getElementById('parceiroCodigoInput');
    if (!input) return;
    const codigo = input.value.trim().toUpperCase();
    if (codigo.length < 7) { mostrarToast('código incompleto'); return; }
    if (codigo === _dadosPerfilAtual?.codigo) { mostrarToast('esse é o seu próprio código'); return; }

    try {
      mostrarToast('buscando...');
      const parceiro = await buscarPorCodigo(codigo);
      if (!parceiro) { mostrarToast('código não encontrado'); return; }
      if (parceiro.casalId) { mostrarToast('parceiro já conectado a outra pessoa'); return; }

      _parceiroUidEncontrado = parceiro.uid;
      const nomeEl  = document.getElementById('parceiroNomeEncontrado');
      const foundEl = document.getElementById('parceiroEncontrado');
      const btnEl   = document.getElementById('btnConectarParceiro');
      if (nomeEl)  nomeEl.textContent   = `${parceiro.nome} — pronto para conectar`;
      if (foundEl) foundEl.style.display = '';
      if (btnEl)   btnEl.style.display   = '';
    } catch (err) {
      mostrarToast('erro ao buscar: ' + err.message);
    }
  }

  async function confirmarConexaoParceiro() {
    if (!_parceiroUidEncontrado || !_fbUid) return;
    try {
      mostrarToast('conectando...');
      const cId = await conectarParceiro(_fbUid, _parceiroUidEncontrado);
      _fbCasalId = cId;
      if (_dadosPerfilAtual) {
        _dadosPerfilAtual.parceiroUid = _parceiroUidEncontrado;
        _dadosPerfilAtual.casalId     = cId;
      }
      _parceiroUidEncontrado = null;
      mostrarToast('parceiro conectado!');
      _iniciarListeners(cId, _fbUid);
      irParaParceiro();
    } catch (err) {
      mostrarToast('erro ao conectar: ' + err.message);
    }
  }

  // ════════════════════════════════════════════════════════
  // TELA DE LUGARES
  // ════════════════════════════════════════════════════════

  let _lugaresLista      = [];
  let _lugaresCatAtiva   = 'todos';
  let _catSelecionadaLugar = null;

  const CAT_CONFIG = {
    airbnb:      { label: 'airbnb',            icon: 'ph-house',      iconCss: 'lugar-icon--airbnb',      badgeCss: 'lugar-cat-badge--airbnb' },
    passeio:     { label: 'passeios locais',   icon: 'ph-tree',       iconCss: 'lugar-icon--passeio',     badgeCss: 'lugar-cat-badge--passeio' },
    gastronomia: { label: 'bar e gastronomia', icon: 'ph-fork-knife', iconCss: 'lugar-icon--gastronomia', badgeCss: 'lugar-cat-badge--gastronomia' },
    viagem:      { label: 'viagem',            icon: 'ph-airplane',   iconCss: 'lugar-icon--viagem',      badgeCss: 'lugar-cat-badge--viagem' },
  };

  function irParaLugares() {
    if (!_autenticado()) return;
    navegar('lugares');
    _renderLugaresLista();
  }

  function _lugaresCatAtualizar(cat) {
    _lugaresCatAtiva = cat;
    document.querySelectorAll('.lugar-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    _renderLugaresLista();
  }

  function _renderLugarItem(l) {
    const parceiroUid = _dadosPerfilAtual?.parceiroUid;
    const autorLabel  = l.adicionadoPor === _fbUid ? 'você'
      : (parceiroUid && l.adicionadoPor === parceiroUid ? 'parceiro' : '');
    const cfg = l.categoria ? CAT_CONFIG[l.categoria] : null;

    const iconHtml = `<div class="lugar-item__icon ${cfg ? cfg.iconCss : 'lugar-icon--todos'}">
      <i class="ph ${cfg ? cfg.icon : 'ph-map-pin'}" aria-hidden="true"></i>
    </div>`;

    const catHtml   = cfg ? `<span class="lugar-item__cat ${cfg.badgeCss}">${cfg.label}</span>` : '';
    const autorHtml = autorLabel ? `<span class="lugar-item__autor">por ${autorLabel}</span>` : '';
    const linkHtml  = l.link
      ? `<a class="lugar-item__link" href="${l.link}" target="_blank" rel="noopener noreferrer">
           <i class="ph ph-arrow-square-out" aria-hidden="true"></i> abrir
         </a>`
      : '';

    return `
      <li class="lugar-item" data-id="${l.id}">
        ${iconHtml}
        <div class="lugar-item__main">
          <div class="lugar-item__nome">${l.nome}</div>
          <div class="lugar-item__meta">${catHtml}${autorHtml}</div>
        </div>
        <div class="lugar-item__actions">
          ${linkHtml}
          <button class="lugar-item__del" data-action="excluir-lugar" data-id="${l.id}" aria-label="Excluir">
            <i class="ph ph-trash" aria-hidden="true"></i>
          </button>
        </div>
      </li>`;
  }

  const _brl = (v) => 'R$ ' + (v || 0).toLocaleString('pt-BR');

  function _renderViagemPlanejada(l) {
    const parceiroUid  = _dadosPerfilAtual?.parceiroUid;
    const autorLabel   = l.adicionadoPor === _fbUid ? 'você'
      : (parceiroUid && l.adicionadoPor === parceiroUid ? 'parceiro' : '');
    const orc          = l.orcamento || {};
    const passagem     = orc.passagem     || 0;
    const alimentacao  = orc.alimentacao  || 0;
    const hospedagem   = orc.hospedagem   || 0;
    const passeios     = orc.passeios     || 0;
    const totalOrc     = passagem + alimentacao + hospedagem + passeios;
    const cofrinho     = l.cofrinho || {};
    const minhaContrib = cofrinho[_fbUid] || 0;
    const parcContrib  = parceiroUid ? (cofrinho[parceiroUid] || 0) : 0;
    const totalCof     = Object.values(cofrinho).reduce((a, b) => a + b, 0);
    const pct          = totalOrc > 0 ? Math.min(100, Math.round((totalCof / totalOrc) * 100)) : 0;

    const linkHtml = l.link ? `<a class="lugar-item__link" href="${l.link}" target="_blank" rel="noopener noreferrer">
      <i class="ph ph-arrow-square-out" aria-hidden="true"></i> abrir</a>` : '';

    const row = (icon, label, val) => val > 0 ? `
      <div class="orcamento-row">
        <span class="orcamento-row__label"><i class="ph ${icon}" aria-hidden="true"></i> ${label}</span>
        <span class="orcamento-row__valor">${_brl(val)}</span>
      </div>` : '';

    const orcHtml = totalOrc > 0 ? `
      <div class="viagem-orcamento">
        ${row('ph-airplane-tilt', 'passagem', passagem)}
        ${row('ph-fork-knife', 'alimentação', alimentacao)}
        ${row('ph-house-simple', 'hospedagem', hospedagem)}
        ${row('ph-map-trifold', 'passeios', passeios)}
        <div class="orcamento-divider"></div>
        <div class="orcamento-total-row"><span>total previsto</span><span>${_brl(totalOrc)}</span></div>
      </div>` : '';

    const contribHtml = (minhaContrib > 0 || parcContrib > 0) ? `
      <div class="viagem-cofrinho__contribuicoes">
        <span>você: ${_brl(minhaContrib)}</span>
        ${parceiroUid ? `<span>parceiro: ${_brl(parcContrib)}</span>` : ''}
      </div>` : '';

    return `
      <li class="lugar-item lugar-item--planejada" data-id="${l.id}">
        <div class="viagem-header">
          <div class="lugar-item__icon lugar-icon--viagem">
            <i class="ph ph-airplane" aria-hidden="true"></i>
          </div>
          <div class="viagem-header__info">
            <div class="lugar-item__nome">${l.nome}</div>
            <div class="lugar-item__meta">
              <span class="lugar-item__cat lugar-cat-badge--viagem">viagem planejada</span>
              ${autorLabel ? `<span class="lugar-item__autor">por ${autorLabel}</span>` : ''}
            </div>
          </div>
          <div class="viagem-header__actions">
            ${linkHtml}
            <button class="lugar-item__del" data-action="excluir-lugar" data-id="${l.id}" aria-label="Excluir">
              <i class="ph ph-trash" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        ${orcHtml}
        <div class="viagem-cofrinho">
          <div class="viagem-cofrinho__header">
            <span class="viagem-cofrinho__label">cofrinho</span>
            <span class="viagem-cofrinho__pct">${_brl(totalCof)}${totalOrc > 0 ? ` · ${pct}%` : ''}</span>
          </div>
          <div class="viagem-cofrinho__bar">
            <div class="viagem-cofrinho__fill" style="width:${pct}%"></div>
          </div>
          ${contribHtml}
          <button class="viagem-cofrinho__btn" data-action="abrir-cofrinho" data-id="${l.id}">
            <i class="ph ph-piggy-bank" aria-hidden="true"></i> adicionar ao cofrinho
          </button>
        </div>
      </li>`;
  }

  function _renderLugaresLista() {
    const listaEl = document.getElementById('lugaresListaEl');
    const vazioEl = document.getElementById('lugaresVazio');
    if (!listaEl) return;
    const filtrado = _lugaresCatAtiva === 'todos'
      ? _lugaresLista
      : _lugaresLista.filter(l => l.categoria === _lugaresCatAtiva);
    if (filtrado.length === 0) {
      if (vazioEl) vazioEl.style.display = '';
      listaEl.innerHTML = '';
      return;
    }
    if (vazioEl) vazioEl.style.display = 'none';
    listaEl.innerHTML = filtrado.map(l => l.planejado ? _renderViagemPlanejada(l) : _renderLugarItem(l)).join('');
  }

  function abrirModalNovoLugar() {
    _catSelecionadaLugar = null;
    const nomeEl = document.getElementById('lugarNome');
    const linkEl = document.getElementById('lugarLink');
    if (nomeEl) nomeEl.value = '';
    if (linkEl) linkEl.value = '';
    document.querySelectorAll('[data-action="selecionar-cat-lugar"]').forEach(b => b.classList.remove('active'));
    abrirModal('modalNovoLugar');
    document.getElementById('lugarNome')?.focus();
  }

  function fecharModalNovoLugar() { fecharModal('modalNovoLugar'); }
  function fecharModalNovoLugarFora(e) {
    if (e.target === document.getElementById('modalNovoLugar')) fecharModalNovoLugar();
  }

  // ── Planejar viagem ──────────────────────────────────────────

  let _viagemCofrinhoId = null;

  function abrirModalPlanejarViagem() {
    ['viagemNome','viagemLink','orcPassagem','orcAlimentacao','orcHospedagem','orcPasseios'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const totalEl = document.getElementById('orcTotalModal');
    if (totalEl) totalEl.textContent = 'R$ 0';
    abrirModal('modalPlanejarViagem');
    document.getElementById('viagemNome')?.focus();
  }
  function fecharModalPlanejarViagem() { fecharModal('modalPlanejarViagem'); }
  function fecharModalPlanejarViagemFora(e) {
    if (e.target === document.getElementById('modalPlanejarViagem')) fecharModalPlanejarViagem();
  }

  function _atualizarTotalOrcamento() {
    const ids = ['orcPassagem','orcAlimentacao','orcHospedagem','orcPasseios'];
    const total = ids.reduce((s, id) => s + (parseFloat(document.getElementById(id)?.value) || 0), 0);
    const el = document.getElementById('orcTotalModal');
    if (el) el.textContent = _brl(total);
  }

  // Atualizar total ao digitar
  ['orcPassagem','orcAlimentacao','orcHospedagem','orcPasseios'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _atualizarTotalOrcamento);
  });

  async function salvarPlanejarViagem() {
    const nome = document.getElementById('viagemNome')?.value.trim();
    if (!nome) { mostrarToast('informe o destino'); return; }
    let link = document.getElementById('viagemLink')?.value.trim();
    if (link && !link.startsWith('http')) link = 'https://' + link;
    const orcamento = {
      passagem:    parseFloat(document.getElementById('orcPassagem')?.value)    || 0,
      alimentacao: parseFloat(document.getElementById('orcAlimentacao')?.value) || 0,
      hospedagem:  parseFloat(document.getElementById('orcHospedagem')?.value)  || 0,
      passeios:    parseFloat(document.getElementById('orcPasseios')?.value)    || 0,
    };
    const lugar = { nome, link: link || null, categoria: 'viagem', planejado: true, orcamento, cofrinho: {} };
    try {
      if (_fbCasalId) await adicionarLugarDB(_fbCasalId, _fbUid, lugar);
      else            await adicionarLugarSoloDB(_fbUid, lugar);
      fecharModalPlanejarViagem();
      mostrarToast('viagem planejada!');
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  function abrirCofrinhoModal(lugarId) {
    _viagemCofrinhoId = lugarId;
    const l = _lugaresLista.find(l => l.id === lugarId);
    const nomeEl = document.getElementById('cofrinhoViagemNome');
    if (nomeEl) nomeEl.textContent = l?.nome || '';
    const valorEl = document.getElementById('cofrinhoValor');
    if (valorEl) valorEl.value = '';
    abrirModal('modalCofrinho');
    document.getElementById('cofrinhoValor')?.focus();
  }
  function fecharCofrinhoModal() {
    fecharModal('modalCofrinho');
    _viagemCofrinhoId = null;
  }

  async function salvarCofrinho() {
    if (!_viagemCofrinhoId) return;
    const valor = parseFloat(document.getElementById('cofrinhoValor')?.value);
    if (!valor || valor <= 0) { mostrarToast('informe um valor válido'); return; }
    try {
      if (_fbCasalId) await adicionarAoCofrinhoDb(_fbCasalId, _viagemCofrinhoId, _fbUid, valor);
      else            await adicionarAoCofrinhoSoloDB(_fbUid, _viagemCofrinhoId, _fbUid, valor);
      fecharCofrinhoModal();
      mostrarToast(`${_brl(valor)} adicionados ao cofrinho!`);
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  function selecionarCatLugar(btn) {
    const cat = btn.dataset.cat;
    if (_catSelecionadaLugar === cat) {
      _catSelecionadaLugar = null;
      btn.classList.remove('active');
    } else {
      _catSelecionadaLugar = cat;
      document.querySelectorAll('[data-action="selecionar-cat-lugar"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  async function salvarLugar() {
    const nome = document.getElementById('lugarNome')?.value.trim();
    let link   = document.getElementById('lugarLink')?.value.trim();
    if (!nome) { mostrarToast('dê um nome ao lugar'); return; }
    if (link && !link.startsWith('http')) link = 'https://' + link;
    const lugar = { nome, link: link || null, categoria: _catSelecionadaLugar };
    try {
      if (_fbCasalId) await adicionarLugarDB(_fbCasalId, _fbUid, lugar);
      else            await adicionarLugarSoloDB(_fbUid, lugar);
      fecharModalNovoLugar();
      mostrarToast('lugar adicionado!');
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  function excluirLugar(lugarId) {
    const l = _lugaresLista.find(l => l.id === lugarId);
    if (!l) return;
    abrirModalConfirmar(
      'remover lugar?',
      `"${l.nome}" será removido da lista.`,
      async () => {
        try {
          if (_fbCasalId) await excluirLugarDB(_fbCasalId, lugarId);
          else            await excluirLugarSoloDB(_fbUid, lugarId);
        } catch (err) { console.error(err); }
      }
    );
  }

  // ════════════════════════════════════════════════════════
  // TELA DE RECEITAS
  // ════════════════════════════════════════════════════════

  let _receitasLista        = [];
  let _receitasTagAtiva     = 'todas';
  let _tagSelecionadaReceita = null;

  const TAG_LABELS = {
    cafe: 'café da manhã', almoco: 'almoço', jantar: 'jantar',
    lanche: 'lanche', sobremesa: 'sobremesa', saudavel: 'saudável'
  };

  function irParaReceitas() {
    if (!_autenticado()) return;
    navegar('receitas');
    _renderReceitasLista();
  }

  function _receitasAtualizarTag(tag) {
    _receitasTagAtiva = tag;
    document.querySelectorAll('.receita-tag-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tag === tag);
    });
    _renderReceitasLista();
  }

  function _renderReceitaItem(r) {
    const parceiroUid = _dadosPerfilAtual?.parceiroUid;
    const autorLabel  = r.adicionadoPor === _fbUid ? 'você'
      : (parceiroUid && r.adicionadoPor === parceiroUid ? 'parceiro' : '');
    const tagHtml   = r.tag   ? `<span class="receita-item__tag">${TAG_LABELS[r.tag] || r.tag}</span>` : '';
    const autorHtml = autorLabel ? `<span class="receita-item__autor">por ${autorLabel}</span>` : '';
    const linkHtml  = r.link
      ? `<a class="receita-item__link" href="${r.link}" target="_blank" rel="noopener noreferrer">
           <i class="ph ph-arrow-square-out" aria-hidden="true"></i> Instagram
         </a>`
      : '';

    return `
      <li class="receita-item" data-id="${r.id}">
        <div class="receita-item__icon">
          <i class="ph ph-cooking-pot" aria-hidden="true"></i>
        </div>
        <div class="receita-item__main">
          <div class="receita-item__titulo">${r.titulo}</div>
          <div class="receita-item__meta">${tagHtml}${autorHtml}</div>
        </div>
        <div class="receita-item__actions">
          ${linkHtml}
          <button class="receita-item__del" data-action="excluir-receita" data-id="${r.id}" aria-label="Excluir">
            <i class="ph ph-trash" aria-hidden="true"></i>
          </button>
        </div>
      </li>`;
  }

  function _renderReceitasLista() {
    const listaEl  = document.getElementById('receitasListaEl');
    const vazioEl  = document.getElementById('receitasVazio');
    const sortBtn  = document.getElementById('receitasSortearBtn');
    if (!listaEl) return;
    const filtrado = _receitasTagAtiva === 'todas'
      ? _receitasLista
      : _receitasLista.filter(r => r.tag === _receitasTagAtiva);
    if (sortBtn) sortBtn.style.display = filtrado.length > 0 ? '' : 'none';
    if (filtrado.length === 0) {
      if (vazioEl) vazioEl.style.display = '';
      listaEl.innerHTML = '';
      return;
    }
    if (vazioEl) vazioEl.style.display = 'none';
    listaEl.innerHTML = filtrado.map(r => _renderReceitaItem(r)).join('');
  }

  function sortearReceita() {
    const pool = _receitasTagAtiva === 'todas'
      ? _receitasLista
      : _receitasLista.filter(r => r.tag === _receitasTagAtiva);
    if (pool.length === 0) { mostrarToast('nenhuma receita para sortear'); return; }
    const sorteada  = pool[Math.floor(Math.random() * pool.length)];
    const tituloEl  = document.getElementById('sorteioReceitaTitulo');
    const tagEl     = document.getElementById('sorteioReceitaTag');
    if (tituloEl) tituloEl.textContent = sorteada.titulo;
    if (tagEl) {
      tagEl.textContent  = sorteada.tag ? TAG_LABELS[sorteada.tag] : '';
      tagEl.style.display = sorteada.tag ? '' : 'none';
    }
    abrirModal('modalSorteioReceita');
  }

  function fecharSorteioReceita() { fecharModal('modalSorteioReceita'); }

  function abrirModalNovaReceita() {
    _tagSelecionadaReceita = null;
    const nomeEl = document.getElementById('receitaNome');
    const linkEl = document.getElementById('receitaLink');
    if (nomeEl) nomeEl.value = '';
    if (linkEl) linkEl.value = '';
    document.querySelectorAll('[data-action="selecionar-tag-receita"]').forEach(b => b.classList.remove('active'));
    abrirModal('modalNovaReceita');
    document.getElementById('receitaNome')?.focus();
  }

  function fecharModalNovaReceita() { fecharModal('modalNovaReceita'); }
  function fecharModalNovaReceitaFora(e) {
    if (e.target === document.getElementById('modalNovaReceita')) fecharModalNovaReceita();
  }

  function selecionarTagReceita(btn) {
    const tag = btn.dataset.tag;
    if (_tagSelecionadaReceita === tag) {
      _tagSelecionadaReceita = null;
      btn.classList.remove('active');
    } else {
      _tagSelecionadaReceita = tag;
      document.querySelectorAll('[data-action="selecionar-tag-receita"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  async function salvarReceita() {
    const titulo = document.getElementById('receitaNome')?.value.trim();
    let link     = document.getElementById('receitaLink')?.value.trim();
    if (!titulo) { mostrarToast('dê um nome à receita'); return; }
    if (link) {
      if (!link.startsWith('http')) link = 'https://' + link;
      if (!link.includes('instagram.com') && !link.includes('instagr.am')) {
        mostrarToast('use um link do Instagram'); return;
      }
    }
    const receita = { titulo, link: link || null, tag: _tagSelecionadaReceita };
    try {
      if (_fbCasalId) await adicionarReceitaDB(_fbCasalId, _fbUid, receita);
      else            await adicionarReceitaSoloDB(_fbUid, receita);
      fecharModalNovaReceita();
      mostrarToast('receita adicionada!');
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  function excluirReceita(receitaId) {
    const r = _receitasLista.find(r => r.id === receitaId);
    if (!r) return;
    abrirModalConfirmar(
      'remover receita?',
      `"${r.titulo}" será removida da lista.`,
      async () => {
        try {
          if (_fbCasalId) await excluirReceitaDB(_fbCasalId, receitaId);
          else            await excluirReceitaSoloDB(_fbUid, receitaId);
        } catch (err) { console.error(err); }
      }
    );
  }

  // ════════════════════════════════════════════════════════
  // TELA DE FILMES
  // ════════════════════════════════════════════════════════

  let _filmesLista      = [];
  let _filmesAbaAtiva   = 'assistir';
  let _filmeAvaliandoId = null;
  let _notaSelecionada  = 0;
  let _generoSelecionado = null;

  function irParaFilmes() {
    if (!_autenticado()) return;
    navegar('filmes');
    _renderFilmesLista();
  }

  function _filmesAtualizarAba(aba) {
    _filmesAbaAtiva = aba;
    document.querySelectorAll('.filmes-tab').forEach(t => {
      const bate = t.dataset.aba === aba;
      t.classList.toggle('active', bate);
      t.setAttribute('aria-selected', bate);
    });
    _renderFilmesLista();
  }

  function _renderEstrelas(nota, cssClass) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="${i <= nota ? 'estrela--on' : 'estrela--off'}">★</span>`;
    }
    return `<span class="estrelas ${cssClass}">${html}</span>`;
  }

  function _renderFilmeItem(f) {
    const minhaAvaliacao    = f.avaliacoes?.[_fbUid];
    const parceiroUid       = _dadosPerfilAtual?.parceiroUid;
    const parceiroAvaliacao = parceiroUid ? f.avaliacoes?.[parceiroUid] : null;
    const generoHtml = f.genero ? `<span class="filme-item__genero">${f.genero}</span>` : '';
    const autorLabel = f.adicionadoPor === _fbUid ? 'você'
      : (parceiroUid && f.adicionadoPor === parceiroUid ? 'parceiro' : '');
    const autorHtml  = autorLabel ? `<span class="filme-item__autor">por ${autorLabel}</span>` : '';

    let avaliacaoHtml = '';
    if (f.assistido) {
      const voceEst     = minhaAvaliacao    != null ? _renderEstrelas(minhaAvaliacao, 'estrelas--voce')     : '';
      const parceiroEst = parceiroAvaliacao != null ? _renderEstrelas(parceiroAvaliacao, 'estrelas--parceiro') : '';
      if (voceEst || parceiroEst) {
        avaliacaoHtml = `<div class="filme-item__avaliacoes">${voceEst}${parceiroEst}</div>`;
      }
    }

    let acaoHtml = '';
    if (!f.assistido) {
      acaoHtml = `<button class="filme-item__btn" data-action="marcar-assistido" data-id="${f.id}">
        <i class="ph ph-eye" aria-hidden="true"></i> marcar
      </button>`;
    } else if (minhaAvaliacao == null) {
      acaoHtml = `<button class="filme-item__btn filme-item__btn--rate" data-action="avaliar-filme" data-id="${f.id}">
        <i class="ph ph-star" aria-hidden="true"></i> avaliar
      </button>`;
    } else {
      acaoHtml = `<button class="filme-item__btn filme-item__btn--rated" data-action="avaliar-filme" data-id="${f.id}">
        <i class="ph ph-pencil" aria-hidden="true"></i> editar
      </button>`;
    }

    return `
      <li class="filme-item ${f.assistido ? 'filme-item--assistido' : ''}" data-id="${f.id}">
        <div class="filme-item__main">
          <div class="filme-item__titulo">${f.titulo}</div>
          <div class="filme-item__meta">${generoHtml}${autorHtml}</div>
          ${avaliacaoHtml}
        </div>
        <div class="filme-item__actions">
          ${acaoHtml}
          <button class="filme-item__del" data-action="excluir-filme" data-id="${f.id}" aria-label="Excluir">
            <i class="ph ph-trash" aria-hidden="true"></i>
          </button>
        </div>
      </li>`;
  }

  function _renderFilmesLista() {
    const listaEl  = document.getElementById('filmesListaEl');
    const vazioEl  = document.getElementById('filmesVazio');
    const sortBtn  = document.getElementById('filmesSortearBtn');
    if (!listaEl) return;

    const filtrado  = _filmesLista.filter(f => _filmesAbaAtiva === 'assistir' ? !f.assistido : f.assistido);
    const pendentes = _filmesLista.filter(f => !f.assistido);

    if (sortBtn) sortBtn.style.display = (pendentes.length > 0 && _filmesAbaAtiva === 'assistir') ? '' : 'none';

    if (filtrado.length === 0) {
      if (vazioEl) vazioEl.style.display = '';
      listaEl.innerHTML = '';
      return;
    }
    if (vazioEl) vazioEl.style.display = 'none';
    listaEl.innerHTML = filtrado.map(f => _renderFilmeItem(f)).join('');
  }

  function abrirModalNovoFilme() {
    _generoSelecionado = null;
    const nomeEl = document.getElementById('filmeNome');
    if (nomeEl) nomeEl.value = '';
    document.querySelectorAll('.genero-opt').forEach(b => b.classList.remove('active'));
    abrirModal('modalNovoFilme');
    document.getElementById('filmeNome')?.focus();
  }

  function fecharModalNovoFilme() { fecharModal('modalNovoFilme'); }
  function fecharModalNovoFilmeFora(e) {
    if (e.target === document.getElementById('modalNovoFilme')) fecharModalNovoFilme();
  }

  function selecionarGenero(btn) {
    const genero = btn.dataset.genero;
    if (_generoSelecionado === genero) {
      _generoSelecionado = null;
      btn.classList.remove('active');
    } else {
      _generoSelecionado = genero;
      document.querySelectorAll('.genero-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  async function salvarFilme() {
    const titulo = document.getElementById('filmeNome')?.value.trim();
    if (!titulo) { mostrarToast('dê um título ao filme'); return; }
    const filme = { titulo, genero: _generoSelecionado };
    try {
      if (_fbCasalId) await adicionarFilmeDB(_fbCasalId, _fbUid, filme);
      else            await adicionarFilmeSoloDB(_fbUid, filme);
      fecharModalNovoFilme();
      mostrarToast('filme adicionado!');
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  async function marcarAssistido(filmeId) {
    try {
      if (_fbCasalId) await marcarFilmeAssistidoDB(_fbCasalId, filmeId);
      else            await marcarFilmeAssistidoSoloDB(_fbUid, filmeId);
      const filme = _filmesLista.find(f => f.id === filmeId);
      if (filme) _abrirAvaliarFilme(filmeId, filme.titulo);
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  function _abrirAvaliarFilme(filmeId, titulo) {
    _filmeAvaliandoId = filmeId;
    const filme = _filmesLista.find(f => f.id === filmeId);
    _notaSelecionada = filme?.avaliacoes?.[_fbUid] || 0;
    const tituloEl = document.getElementById('avaliarFilmeTitulo');
    if (tituloEl) tituloEl.textContent = titulo;
    _atualizarEstrelasPicker(_notaSelecionada);
    abrirModal('modalAvaliarFilme');
  }

  function _atualizarEstrelasPicker(nota) {
    document.querySelectorAll('#estrelasPicker .estrela-btn').forEach((btn, i) => {
      btn.classList.toggle('ativa', i < nota);
    });
  }

  function selecionarNota(nota) {
    _notaSelecionada = nota;
    _atualizarEstrelasPicker(nota);
  }

  async function confirmarAvaliacao() {
    if (!_filmeAvaliandoId || _notaSelecionada === 0) { mostrarToast('selecione uma nota'); return; }
    try {
      if (_fbCasalId) await avaliarFilmeDB(_fbCasalId, _filmeAvaliandoId, _fbUid, _notaSelecionada);
      else            await avaliarFilmeSoloDB(_fbUid, _filmeAvaliandoId, _notaSelecionada);
      fecharModal('modalAvaliarFilme');
      mostrarToast('avaliação salva!');
      _filmeAvaliandoId = null;
    } catch (err) { mostrarToast('erro: ' + err.message); }
  }

  function pularAvaliacao() {
    fecharModal('modalAvaliarFilme');
    _filmeAvaliandoId = null;
  }

  function excluirFilme(filmeId) {
    const filme = _filmesLista.find(f => f.id === filmeId);
    if (!filme) return;
    abrirModalConfirmar(
      'remover filme?',
      `"${filme.titulo}" será removido da lista.`,
      async () => {
        try {
          if (_fbCasalId) await excluirFilmeDB(_fbCasalId, filmeId);
          else            await excluirFilmeSoloDB(_fbUid, filmeId);
        } catch (err) { console.error(err); }
      }
    );
  }

  function sortearFilme() {
    const pendentes = _filmesLista.filter(f => !f.assistido);
    if (pendentes.length === 0) { mostrarToast('nenhum filme para sortear'); return; }
    const sorteado = pendentes[Math.floor(Math.random() * pendentes.length)];
    const tituloEl = document.getElementById('sorteioTitulo');
    const generoEl = document.getElementById('sorteioGenero');
    if (tituloEl) tituloEl.textContent = sorteado.titulo;
    if (generoEl) {
      generoEl.textContent  = sorteado.genero || '';
      generoEl.style.display = sorteado.genero ? '' : 'none';
    }
    abrirModal('modalSorteio');
  }

  function fecharSorteio() { fecharModal('modalSorteio'); }

  function irParaHome() {
    if (!_autenticado()) return;
    navegar('home');
    atualizarProgresso();
  }

  // ════════════════════════════════════════════════════════
  // TELA DE ESTATÍSTICAS
  // ════════════════════════════════════════════════════════

  function irParaEstatisticas() {
    if (!_autenticado()) return;
    navegar('estatisticas');
    _renderEstatisticas();
  }

  function _statsMesAnterior() {
    _statsMes--;
    if (_statsMes < 1) { _statsMes = 12; _statsAno--; }
    _renderEstatisticas();
  }

  function _statsMesProximo() {
    const agora = new Date();
    if (_statsAno === agora.getFullYear() && _statsMes >= agora.getMonth() + 1) return;
    _statsMes++;
    if (_statsMes > 12) { _statsMes = 1; _statsAno++; }
    _renderEstatisticas();
  }

  function _renderEstatisticas() {
    const labelEl = document.getElementById('statsPeriodoLabel');
    if (labelEl) labelEl.textContent = `${MESES_PT[_statsMes - 1]} ${_statsAno}`;

    const meuNome     = _dadosPerfilAtual?.nome || 'você';
    const parceiroUid = _dadosPerfilAtual?.parceiroUid;
    const mesStr      = `${_statsAno}-${String(_statsMes).padStart(2, '0')}`;

    const nomeVoceEl  = document.getElementById('statsNomeVoce');
    const nomeParcEl  = document.getElementById('statsNomeParceiro');
    if (nomeVoceEl) nomeVoceEl.textContent = meuNome;
    if (nomeParcEl) nomeParcEl.textContent = _nomePartner;

    const avatarVoceEl = document.getElementById('statsAvatarVoce');
    const avatarParcEl = document.getElementById('statsAvatarParceiro');
    if (avatarVoceEl && _dadosPerfilAtual?.avatar) avatarVoceEl.innerHTML = _htmlAvatar(_dadosPerfilAtual.avatar);
    if (avatarParcEl && _avatarPartner) avatarParcEl.innerHTML = _htmlAvatar(_avatarPartner);

    // Ocultar coluna parceiro se usuário for solo
    const duoCardParceiro = document.getElementById('statsDuoParceiro');
    const duoSep          = document.getElementById('statsDuoSep');
    const hasParceiro     = !!parceiroUid;
    if (duoCardParceiro) duoCardParceiro.style.display = hasParceiro ? '' : 'none';
    if (duoSep)          duoSep.style.display          = hasParceiro ? '' : 'none';

    // Contabilizar tarefas concluídas no mês a partir do snapshot
    let qtdVoce = 0, qtdParceiro = 0;
    if (_tarefasSnapshot) {
      _tarefasSnapshot.forEach(docSnap => {
        const concluidaPor = docSnap.data().concluidaPor || {};
        if (_fbUid      && concluidaPor[_fbUid]?.startsWith(mesStr))      qtdVoce++;
        if (parceiroUid && concluidaPor[parceiroUid]?.startsWith(mesStr)) qtdParceiro++;
      });
    }

    const numVoceEl = document.getElementById('statsNumVoce');
    const numParcEl = document.getElementById('statsNumParceiro');
    if (numVoceEl) numVoceEl.textContent = qtdVoce;
    if (numParcEl) numParcEl.textContent = hasParceiro ? qtdParceiro : '—';

    const total       = qtdVoce + (hasParceiro ? qtdParceiro : 0);
    const chartSec    = document.getElementById('statsChartSection');
    const vazioEl     = document.getElementById('statsVazio');
    const canvas      = document.getElementById('statsChart');
    const legendEl    = document.getElementById('statsChartLegend');

    if (total === 0) {
      if (chartSec) chartSec.style.display = 'none';
      if (vazioEl)  vazioEl.style.display = '';
    } else {
      if (chartSec) chartSec.style.display = '';
      if (vazioEl)  vazioEl.style.display = 'none';

      if (canvas) _desenharGraficoPizza(canvas, qtdVoce, hasParceiro ? qtdParceiro : 0, total);

      if (legendEl) {
        legendEl.innerHTML =
          `<div class="stats-legend-item">
            <div class="stats-legend-dot" style="background:#D97789"></div>
            <span>${meuNome}: ${qtdVoce}</span>
          </div>` +
          (hasParceiro ? `<div class="stats-legend-item">
            <div class="stats-legend-dot" style="background:#DB8E02"></div>
            <span>${_nomePartner}: ${qtdParceiro}</span>
          </div>` : '');
      }
    }

    // Card de conteúdo: filmes, receitas, viagens
    const filmesAssistidos = _filmesLista.filter(f => f.assistido).length;
    const filmesTotal      = _filmesLista.length;
    const receitasTotal    = _receitasLista.length;
    const viagensTotal     = _lugaresLista.filter(l => l.categoria === 'viagem').length;

    const filmesNumEl  = document.getElementById('statsFilmesNum');
    const filmesSub    = document.getElementById('statsFilmesSub');
    const receitasNumEl = document.getElementById('statsReceitasNum');
    const viagensNumEl  = document.getElementById('statsViagensNum');

    if (filmesNumEl)   filmesNumEl.textContent   = filmesAssistidos;
    if (filmesSub)     filmesSub.textContent     = filmesTotal > 0 ? `de ${filmesTotal}` : '';
    if (receitasNumEl) receitasNumEl.textContent = receitasTotal;
    if (viagensNumEl)  viagensNumEl.textContent  = viagensTotal;
  }

  function _desenharGraficoPizza(canvas, voce, parceiro, total) {
    const dpr  = window.devicePixelRatio || 1;
    const size = 220;
    canvas.width        = size * dpr;
    canvas.height       = size * dpr;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx   = size / 2;
    const cy   = size / 2;
    const rExt = size / 2 - 8;
    const rInt = rExt * 0.58;

    const getCssVar = (v, fallback) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
    const bgColor   = getCssVar('--color-bg-surface',    '#F5EDD5');
    const textPrim  = getCssVar('--color-text-primary',  '#1C1003');
    const textTert  = getCssVar('--color-text-tertiary', '#8A7060');

    const slices = [];
    if (voce    > 0) slices.push({ v: voce,    cor: '#D97789' });
    if (parceiro > 0) slices.push({ v: parceiro, cor: '#DB8E02' });

    let ang = -Math.PI / 2;
    slices.forEach(({ v, cor }) => {
      const delta = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rExt, ang, ang + delta);
      ctx.closePath();
      ctx.fillStyle = cor;
      ctx.fill();
      ang += delta;
    });

    // Furo central
    ctx.beginPath();
    ctx.arc(cx, cy, rInt, 0, Math.PI * 2);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Número total
    ctx.fillStyle    = textPrim;
    ctx.font         = `700 ${Math.round(rInt * 0.5)}px Manrope, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - rInt * 0.14);

    // Label "tarefas"
    ctx.fillStyle = textTert;
    ctx.font      = `${Math.round(rInt * 0.27)}px Manrope, sans-serif`;
    ctx.fillText('tarefas', cx, cy + rInt * 0.27);
  }

  async function cadastroGoogle() {
    try {
      await loginComGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        mostrarToast('erro: ' + err.code);
      }
    }
  }

  // Gerar código de convite ao carregar
  const inviteEl = document.getElementById('inviteCode');
  if (inviteEl) inviteEl.textContent = gerarCodigo();

  // ════════════════════════════════════════════════════════
  // TELA HOME
  // ════════════════════════════════════════════════════════

  let tarefasConcluidas = 0;
  let totalTarefas = 0;

  function atualizarProgresso() {
    const fill  = document.getElementById('progressFill');
    const count = document.getElementById('progressCount');
    if (!fill || !count) return; // evita erro se elemento não existe
    const pct = totalTarefas > 0 ? Math.round((tarefasConcluidas / totalTarefas) * 100) : 0;
    fill.style.width  = pct + '%';
    count.textContent = tarefasConcluidas + ' de ' + totalTarefas;
  }
  async function toggleTask(item) {
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
      check.innerHTML = '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>';
      name.classList.add('done');
      tarefasConcluidas = Math.min(totalTarefas, tarefasConcluidas + 1);
    }
    atualizarProgresso();
  }


  function verParceiro() {
    mostrarToast('perfil do parceiro — em breve');
  }

  function irParaTarefas() { if (!_autenticado()) return; navegar('tarefas'); inicializarTarefas(); }

  function irParaExercicios() { if (!_autenticado()) return; navegar('exercicios'); inicializarExercicios(); }

  function irParaLoja() {
    if (!_autenticado()) return;
    navegar('loja');
    inicializarLoja();
    // Atualizar saldo na loja
    const saldoEl = document.getElementById('lojaSaldo');
    if (saldoEl) saldoEl.textContent = saldoAtual;
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

  let tipoSelecionado = 'diaria';

  function selecionarTipo(btn) {
    document.querySelectorAll('.tipo-opt').forEach(o => o.classList.remove('active'));
    btn.classList.add('active');
    tipoSelecionado = btn.dataset.tipo;

    const cicloField = document.getElementById('cicloField');
    if (cicloField) {
      cicloField.classList.toggle('is-hidden', tipoSelecionado !== 'pontual');
    }
  }

  function ajustarCiclo(delta) {
    const input = document.getElementById('cicloDias');
    if (!input) return;
    const novo = Math.max(1, Math.min(365, (parseInt(input.value) || 1) + delta));
    input.value = novo;
  }


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

async function toggleTaskHome(item) {
  const check  = item.querySelector('.task-check');
  const name   = item.querySelector('.task-item__name');
  const pts    = parseInt(item.dataset.pts) || 0;
  const taskId = item.dataset.taskId;
  const tipo   = item.dataset.tipo || 'diaria';
  const ciclo  = parseInt(item.dataset.ciclo) || 0;
  const done   = check.classList.contains('done');

  // Atualização otimista da UI
  check.classList.toggle('done', !done);
  check.innerHTML = !done ? '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>' : '';
  name.classList.toggle('done', !done);

  // Sincronizar o outro elemento com o mesmo taskId (home ↔ tarefas)
  document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => {
    if (el === item) return;
    const c = el.querySelector('.task-check');
    const n = el.querySelector('.task-item__name');
    if (c) { c.classList.toggle('done', !done); c.innerHTML = !done ? '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>' : ''; }
    if (n) n.classList.toggle('done', !done);
  });

  atualizarProgressoHome();
  if (item.dataset.grupo) atualizarBadgeGrupo(item.dataset.grupo);

  if (_fbUid) {
    try {
      if (!done) mostrarToast('+' + pts + ' moedas');
      if (_fbCasalId) {
        await Promise.all([
          marcarTarefaDB(_fbCasalId, taskId, _fbUid, !done, tipo, ciclo),
          done
            ? adicionarSaldoDB(_fbCasalId, _fbUid, -pts, 'desfeito: ' + name.textContent)
            : adicionarSaldoDB(_fbCasalId, _fbUid,  pts, name.textContent),
        ]);
      } else {
        await Promise.all([
          marcarTarefaSoloDB(_fbUid, taskId, !done, tipo, ciclo),
          atualizarSaldoUsuarioDB(_fbUid, done ? -pts : pts),
        ]);
      }
    } catch (err) { console.error(err); }
  }
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
    ['limpeza', 'pets', 'organizacao', 'roupas', 'outros', 'cozinha', 'banheiro'].forEach(atualizarBadgeGrupo);
  }

  function atualizarResumoDia() {
    const el = document.getElementById('tarefasResumoDia');
    if (!el) return;
    const todas      = document.querySelectorAll('#tarefasLista .task-item').length;
    const concluidas = document.querySelectorAll('#tarefasLista .task-check.done').length;
    el.textContent   = concluidas + ' de ' + todas + ' hoje';
  }

  function abrirModalNovaTarefa() {
    abrirModal('modalNovaTarefa');
    document.getElementById('novaTarefaNome').focus();
  }

  function fecharModalNovaTarefa() {
    fecharModal('modalNovaTarefa');
    document.getElementById('novaTarefaNome').value = '';

    // Reset tipo
    document.querySelectorAll('.tipo-opt').forEach(o => o.classList.remove('active'));
    const tipoDefault = document.querySelector('.tipo-opt[data-tipo="diaria"]');
    if (tipoDefault) tipoDefault.classList.add('active');
    tipoSelecionado = 'diaria';
    document.getElementById('cicloField')?.classList.add('is-hidden');
    const ciclo = document.getElementById('cicloDias');
    if (ciclo) ciclo.value = 3;

    // Reset grupo
    const select = document.getElementById('novaTarefaGrupo');
    if (select) select.value = 'limpeza';
  }

  function fecharModalNovaTarefaFora(e) {
    if (e.target === document.getElementById('modalNovaTarefa')) fecharModalNovaTarefa();
  }

  async function criarTarefa() {
    if (!_fbUid) { mostrarToast('faça login para criar tarefas'); return; }
    const nome  = document.getElementById('novaTarefaNome').value.trim();
    const grupo = document.getElementById('novaTarefaGrupo').value;
    if (!nome) { mostrarToast('dê um nome para a tarefa'); return; }

    const cicloDias = tipoSelecionado === 'pontual'
      ? parseInt(document.getElementById('cicloDias').value) || 1
      : null;

    const tarefa = {
      nome, grupo,
      tipo: tipoSelecionado,
      ciclo: cicloDias,
      proxData: cicloDias ? new Date().toISOString() : null,
    };

    fecharModalNovaTarefa();
    mostrarToast('tarefa criada');

    try {
      if (_fbCasalId) {
        await criarTarefaDB(_fbCasalId, tarefa);
      } else {
        await criarTarefaSoloDB(_fbUid, tarefa);
      }
    } catch (err) {
      console.error('Erro ao salvar tarefa:', err);
      mostrarToast('erro ao salvar tarefa');
    }
  }

  // Calcula a próxima data baseada no ciclo (em dias)

  function excluirTarefa(taskId) {
    const item = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!item) return;
    const nome  = item.querySelector('.task-item__name')?.textContent || 'tarefa';
    const grupo = item.dataset.grupo;
    abrirModalConfirmar(
      'remover tarefa?',
      `"${nome}" será removida da lista.`,
      async () => {
        // Remove todos os elementos com esse task-id (home + tarefas)
        document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => el.remove());
        atualizarBadgeGrupo(grupo);
        atualizarResumoDia();
        atualizarProgressoHome();
        mostrarToast(`"${nome}" excluída`);
        try {
          if (_fbCasalId) await excluirTarefaDB(_fbCasalId, taskId);
          else if (_fbUid) await excluirTarefaSoloDB(_fbUid, taskId);
        } catch (err) { console.error('Erro ao excluir tarefa:', err); }
      }
    );
  }

  function calcularProxData(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d;
  }

  // Verifica todas as tarefas pontuais e marca as atrasadas
  function verificarAtrasadas() {
    const agora = new Date();
    document.querySelectorAll('.task-item[data-tipo="pontual"]').forEach(item => {
      const prox = item.dataset.proxData ? new Date(item.dataset.proxData) : null;
      if (!prox) return;
      const atrasada = agora > prox;
      item.classList.toggle('task-item--atrasada', atrasada);
      // Atualiza tag
      const tag = item.querySelector('.task-item__tag');
      const ciclo = item.dataset.ciclo;
      if (tag && ciclo) {
        tag.innerHTML = atrasada
          ? `<span class="task-item__alerta"><i class="ph-fill ph-warning-circle" aria-hidden="true"></i> em atraso</span>`
          : `a cada ${ciclo} dia${ciclo > 1 ? 's' : ''}`;
      }
    });
  }
  function inicializarTarefas() {
    inicializarBadges();
    atualizarResumoDia();
    verificarAtrasadas();
  }

  // ── Reset de meia-noite ────────────────────────────────────
  let _ultimoDia = _dataLocal();

  function _verificarMudancaDia() {
    const hoje = _dataLocal();
    if (_ultimoDia === hoje) return;
    _ultimoDia = hoje;

    // Reseta o estado visual das tarefas diárias
    document.querySelectorAll('.task-item[data-tipo="diaria"]').forEach(item => {
      const check = item.querySelector('.task-check');
      const name  = item.querySelector('.task-item__name');
      if (check) { check.classList.remove('done'); check.innerHTML = ''; }
      if (name)  name.classList.remove('done');
    });

    // Reavalia visibilidade das tarefas pontuais no home
    document.querySelectorAll('#homeTarefasList .task-item[data-tipo="pontual"]').forEach(item => {
      const proxDataStr = item.dataset.proxData
        ? item.dataset.proxData.substring(0, 10)
        : hoje;
      item.classList.toggle('is-hidden', proxDataStr > hoje);
    });

    atualizarProgressoHome();
    inicializarBadges();
    atualizarResumoDia();
  }

  setInterval(_verificarMudancaDia, 60000);

  const exEstado = {
  streakVoce:     0,
  streakParceiro: 0,
  metaDias:       30,
  feitoHoje:      false,
  historico:      []
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
        ? '<i class="ph-bold ph-check" aria-hidden="true"></i>'
        : dia.getDate();
    } else {
      const idx = exEstado.historico[dia.getDate() - 1];
      if (idx === true) {
        dotClass += ' ex-cal-day__dot--done';
        conteudo  = '<i class="ph-bold ph-check" aria-hidden="true"></i>';
      } else if (idx === false) {
        dotClass += ' ex-cal-day__dot--miss';
        conteudo  = '<i class="ph-bold ph-x" aria-hidden="true"></i>';
      } else {
        dotClass += ' ex-cal-day__dot--future'; // sem dados
      }
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
    if (isFuturo)        cls += ' ex-history-dot--future';
    else if (feito === true)  cls += ' ex-history-dot--done';
    else if (feito === false) cls += ' ex-history-dot--miss';
    else                      cls += ' ex-history-dot--future'; // sem dados
    grid.innerHTML += `<div class="${cls}" title="dia ${d}"></div>`;
  }
}
 
function atualizarBotaoCheckin() {
  const btn    = document.getElementById('exCheckinBtn');
  const done   = document.getElementById('exCheckinDone');
  const status = document.getElementById('streakVoceStatus');
  if (!btn || !done) return;
  btn.classList.toggle('is-hidden', exEstado.feitoHoje);
  done.classList.toggle('is-hidden', !exEstado.feitoHoje);
  if (status) {
    if (exEstado.feitoHoje) {
      status.className = 'ex-streak-card__status';
      status.innerHTML = '<i class="ph ph-check-circle icon-xs" aria-hidden="true"></i> feito hoje';
    } else {
      status.className = 'ex-streak-card__status ex-streak-card__status--pending';
      status.innerHTML = '<i class="ph ph-clock icon-xs" aria-hidden="true"></i> pendente';
    }
  }
}
 
function fazerCheckin() {
  if (exEstado.feitoHoje) return;

  exEstado.feitoHoje = true;
  exEstado.streakVoce++;

  const hoje     = new Date();
  const hojeISO  = hoje.toISOString().split('T')[0];
  exEstado.historico[hoje.getDate() - 1] = true;

  atualizarStreaks();
  atualizarMeta();
  renderizarCalendarioSemanal();
  renderizarHistoricoMensal();
  atualizarBotaoCheckin();

  if (_fbUid) {
    fazerCheckinDB(_fbUid, exEstado.streakVoce, hojeISO).catch(err => console.error(err));
  }
 
  // Atualizar status na tela
  const status = document.getElementById('streakVoceStatus');
  if (status) {
    status.className = 'ex-streak-card__status';
    status.innerHTML = `<i class="ph ph-check-circle icon-xs" aria-hidden="true"></i> feito hoje`;
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
  if (emoji) {
    const icone = exEstado.streakVoce >= 30 ? 'ph-medal'
                : exEstado.streakVoce >= 14 ? 'ph-lightning'
                : 'ph-fire';
    emoji.innerHTML = `<i class="ph-fill ${icone}" aria-hidden="true"></i>`;
  }
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

  
  // Mostrar/esconder campo "novo grupo" conforme seleção do select
  const selectGrupo = document.getElementById('novaTarefaGrupo');
  if (selectGrupo) {
    selectGrupo.addEventListener('change', () => {
      const campo = document.getElementById('novoGrupoField');
      if (!campo) return;
      campo.classList.toggle('is-hidden', selectGrupo.value !== '__novo__');
      if (selectGrupo.value === '__novo__') {
        document.getElementById('novoGrupoNome')?.focus();
      }
    });
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
    'fechar-modal-recuperar':       () => fecharModalRecuperar(),
    'fechar-modal-recuperar-fora':  (el, e) => fecharModalFora(e),
    'enviar-recuperacao':           () => enviarRecuperacao(),

    // Senha
    'toggle-senha':                 (el) => toggleSenha(el),

    // Avatar upload
    'upload-avatar':                () => abrirUploadAvatar(),

    // Cadastro
    'voltar-cadastro':              () => voltarCadastro(),
    'cadastro-google':              () => cadastroGoogle(),
    'copiar-codigo':                () => copiarCodigo(),
    'verificar-parceiro':           () => verificarParceiro(),
    'avancar':                      (el) => avancar(parseInt(el.dataset.etapa), el.dataset.pular === 'true'),
    'selecionar-avatar':            (el) => selecionarAvatar(el),
    'selecionar-cor':               (el) => selecionarCor(el),

    // Notificações
    'abrir-notificacoes':           () => abrirModalNotificacoes(),
    'fechar-notificacoes':          () => fecharModalNotificacoes(),
    'fechar-notificacoes-fora':     (el, e) => { if (e.target === document.getElementById('modalNotificacoes')) fecharModalNotificacoes(); },
    'limpar-notificacoes':          () => limparNotificacoes(),

    // Home / navegação
    'ver-parceiro':                 () => irParaParceiro(),
    'ir-home':                      () => irParaHome(),
    'ir-estatisticas':              () => irParaEstatisticas(),
    'stats-mes-anterior':           () => _statsMesAnterior(),
    'stats-mes-proximo':            () => _statsMesProximo(),
    'ir-parceiro':                  () => irParaParceiro(),
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
    'criar-tarefa':                 () => criarTarefa(),

    // Exercícios
    'abrir-meta':                   () => abrirModalMeta(),
    'fechar-meta':                  () => fecharModalMeta(),
    'fechar-meta-fora':             (el, e) => fecharModalMetaFora(e),
    'selecionar-meta':              (el) => selecionarMeta(el),
    'salvar-meta':                  () => salvarMeta(),
    'fazer-checkin':                () => fazerCheckin(),
    'fechar-celebracao':            () => fecharCelebracao(),

    // Perfil e logout
    'ir-perfil':                    () => irParaPerfil(),
    'copiar-codigo-perfil':         () => copiarCodigoPerfil(),
    'confirmar-reset':              () => abrirModal('modalReset'),
    'fechar-reset':                 () => fecharModal('modalReset'),
    'fazer-reset':                  () => resetarProgresso(),
    'confirmar-logout':             () => abrirModal('modalLogout'),
    'fechar-logout':                () => fecharModal('modalLogout'),
    'fazer-logout':                 () => fazerLogout(),

    // Parceiro
    'verificar-parceiro-tela':      () => verificarParceiroCodigo(),
    'confirmar-conexao-parceiro':   () => confirmarConexaoParceiro(),

    // Lugares
    'ir-lugares':                   () => irParaLugares(),
    'lugares-cat':                  (el) => _lugaresCatAtualizar(el.dataset.cat),
    'abrir-novo-lugar':             () => abrirModalNovoLugar(),
    'fechar-novo-lugar':            () => fecharModalNovoLugar(),
    'fechar-novo-lugar-fora':       (el, e) => fecharModalNovoLugarFora(e),
    'selecionar-cat-lugar':         (el) => selecionarCatLugar(el),
    'salvar-lugar':                 () => salvarLugar(),
    'excluir-lugar':                (el) => excluirLugar(el.dataset.id),
    'planejar-viagem':              () => abrirModalPlanejarViagem(),
    'fechar-planejar-viagem':       () => fecharModalPlanejarViagem(),
    'fechar-planejar-viagem-fora':  (el, e) => fecharModalPlanejarViagemFora(e),
    'salvar-planejar-viagem':       () => salvarPlanejarViagem(),
    'abrir-cofrinho':               (el) => abrirCofrinhoModal(el.dataset.id),
    'fechar-cofrinho':              () => fecharCofrinhoModal(),
    'salvar-cofrinho':              () => salvarCofrinho(),

    // Receitas
    'ir-receitas':                  () => irParaReceitas(),
    'receitas-tag':                 (el) => _receitasAtualizarTag(el.dataset.tag),
    'abrir-nova-receita':           () => abrirModalNovaReceita(),
    'fechar-nova-receita':          () => fecharModalNovaReceita(),
    'fechar-nova-receita-fora':     (el, e) => fecharModalNovaReceitaFora(e),
    'selecionar-tag-receita':       (el) => selecionarTagReceita(el),
    'salvar-receita':               () => salvarReceita(),
    'excluir-receita':              (el) => excluirReceita(el.dataset.id),
    'sortear-receita':              () => sortearReceita(),
    'fechar-sorteio-receita':       () => fecharSorteioReceita(),

    // Filmes
    'ir-filmes':                    () => irParaFilmes(),
    'filmes-aba':                   (el) => _filmesAtualizarAba(el.dataset.aba),
    'abrir-novo-filme':             () => abrirModalNovoFilme(),
    'fechar-novo-filme':            () => fecharModalNovoFilme(),
    'fechar-novo-filme-fora':       (el, e) => fecharModalNovoFilmeFora(e),
    'selecionar-genero':            (el) => selecionarGenero(el),
    'salvar-filme':                 () => salvarFilme(),
    'marcar-assistido':             (el) => marcarAssistido(el.dataset.id),
    'avaliar-filme':                (el) => {
      const f = _filmesLista.find(f => f.id === el.dataset.id);
      if (f) _abrirAvaliarFilme(f.id, f.titulo);
    },
    'selecionar-nota':              (el) => selecionarNota(parseInt(el.dataset.nota)),
    'confirmar-avaliacao':          () => confirmarAvaliacao(),
    'pular-avaliacao':              () => pularAvaliacao(),
    'excluir-filme':                (el) => excluirFilme(el.dataset.id),
    'sortear-filme':                () => sortearFilme(),
    'fechar-sorteio':               () => fecharSorteio(),

    // Excluir tarefa
    'excluir-tarefa':               (el) => excluirTarefa(el.dataset.taskId),

    // Modal de confirmação de exclusão
    'fechar-confirmar':             () => fecharModalConfirmar(),
    'confirmar-exclusao':           () => confirmarExclusao(),

    // Tipo de tarefa
    'selecionar-tipo':              (el) => selecionarTipo(el),
    'ciclo-mais':                   () => ajustarCiclo(1),
    'ciclo-menos':                  () => ajustarCiclo(-1),

    // Loja
    'loja-aba':                     (el) => ativarAbaLoja(el.dataset.aba),
    'abrir-novo-item':              () => abrirNovoItem(),
    'fechar-novo-item':             () => fecharNovoItem(),
    'fechar-novo-item-fora':        (el, e) => fecharNovoItemFora(e),
    'salvar-novo-item':             () => salvarNovoItem(),
    'selecionar-tipo-item':         (el) => selecionarTipoItem(el),
    'item-custo-mais':              () => ajustarItemCusto(50),
    'item-custo-menos':             () => ajustarItemCusto(-50),
    'iniciar-resgatar':             (el) => iniciarResgatar(el.dataset.id),
    'iniciar-resgatar-casal':       (el) => iniciarResgatarCasal(el.dataset.id),
    'confirmar-resgatar':           () => confirmarResgatar(),
    'fechar-resgatar':              () => fecharModalResgatar(),
    'confirmar-resgatar-casal':     () => confirmarResgatarCasal(),
    'fechar-resgatar-casal':        () => fecharResgatarCasal(),
    'excluir-item': (el) => {
      const id   = el.dataset.id;
      const item = [...lojaEstado.individuais, ...lojaEstado.casal].find(i => i.id === id);
      abrirModalConfirmar(
        'remover item?',
        `"${item?.nome || 'item'}" será removido da loja.`,
        () => excluirItem(id)
      );
    },
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

  // ── Botão voltar do dispositivo (Android / PWA) ─────────────
  window.addEventListener('popstate', () => {
    // 1. Se há modal aberto, fecha-o em vez de navegar
    const modalAberto = document.querySelector('.modal-backdrop.open');
    if (modalAberto) {
      fecharModal(modalAberto.id);
      history.pushState({ dueto: _navStack[_navStack.length - 1] || 'home' }, '');
      return;
    }

    // 2. Navegar para a tela anterior no histórico interno
    if (_navStack.length > 1) {
      _poppingState = true;
      _navStack.pop();
      const anterior = _navStack[_navStack.length - 1];
      navegar(anterior);
      history.pushState({ dueto: anterior }, '');
      _poppingState = false;
    } else {
      // Na raiz: impedir saída/reload do app — push state de volta
      history.pushState({ dueto: _navStack[0] || 'home' }, '');
    }
  });

});