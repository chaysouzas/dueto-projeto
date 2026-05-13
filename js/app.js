/* 
   DUETO — app.js  v2.0 — Firebase integrado */

// ── Imports do Firebase (via CDN — sem bundler necessário) ──
import {
  iniciarAuthListener, loginEmail, loginComGoogle,
  recuperarSenha, cadastrarEmail,
  criarPerfil, buscarPorCodigo, conectarParceiro,
  criarTarefaDB, excluirTarefaDB, ouvirTarefas,
  salvarExercicioDB, ouvirExercicios,
  criarItemLojaDB, excluirItemLojaDB,
  resgatarItemDB, confirmarResgateCasalDB, ouvirLoja,
  adicionarSaldoDB, atualizarSaldoUsuarioDB, ouvirSaldo,
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

// ── 3. Navegação entre telas ───────────────────────────────
function navegar(id) {
  const tela = document.getElementById('tela-' + id);
  if (!tela) { mostrarToast('em breve'); return; }
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
  tela.classList.add('ativa');
  // Atualizar nav-bar
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.action === 'ir-' + id);
    b.setAttribute('aria-current', b.dataset.action === 'ir-' + id ? 'page' : 'false');
  });
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
  const resgatado = item.resgatado;
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
          ? `<span class="loja-item__tag loja-item__tag--done">
               <i class="ph ph-check-circle" aria-hidden="true"></i> resgatado
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

// ── Resgatar individual ───────────────────────────────────────
function iniciarResgatar(id) {
  const item = lojaEstado.individuais.find(i => i.id === id);
  if (!item || item.resgatado) return;
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
      item.resgatado = true;
      saldoAtual -= item.custo;
      salvarLoja();
      atualizarSaldo();
      renderizarLoja();
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
    avatarEl.innerHTML = `<i class="ph ${d.avatar}" aria-hidden="true"></i>`;
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

async function fazerLogout() {
  fecharModal('modalLogout');
  _fbUid     = null;
  _fbCasalId = null;
  _unsubTarefas?.(); _unsubTarefas = null;
  _unsubLoja?.();    _unsubLoja    = null;
  _unsubSaldo?.();   _unsubSaldo   = null;
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
          avatarEl.innerHTML = `<i class="ph ${dados.avatar}" aria-hidden="true"></i>`;
        }

        saldoAtual = dados.saldo || 0;
        atualizarSaldo();

        // Ouvir saldo SEMPRE — independente de ter casal
        _unsubSaldo?.();
        _unsubSaldo = ouvirSaldo(user.uid, (saldo) => {
          saldoAtual = saldo;
          atualizarSaldo();
        });

        // Ir para home se estiver no login ou cadastro
        const telaAtiva = document.querySelector('.tela.ativa');
        if (!telaAtiva || telaAtiva.id === 'tela-login' || telaAtiva.id === 'tela-cadastro') {
          navegar('home');
        }

        // Iniciar listeners em tempo real se tiver casal
        if (dados.casalId) {
          _iniciarListeners(dados.casalId, user.uid);
        }
      } else {
        // Usuário logado mas sem perfil — ir para cadastro
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
          resgatado: !!d.resgatadoPor
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

  function _iniciarListeners(casalId, uid) {
    _pararListeners();

    // Loja em tempo real
    _unsubLoja = ouvirLoja(casalId, (snap) => {
      _renderLojaFirestore(snap);
    });

    // Tarefas em tempo real
    _unsubTarefas = ouvirTarefas(casalId, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          _renderTarefaFirestore(change.doc, uid);
        } else if (change.type === 'removed') {
          document.querySelector(`[data-task-id="${change.doc.id}"]`)?.remove();
        }
      });
      atualizarResumoDia();
      inicializarBadges();
    });
  }

  function _pararListeners() {
    _unsubTarefas?.();
    _unsubLoja?.();
    _unsubSaldo?.();
    _unsubTarefas = null;
    _unsubLoja    = null;
    _unsubSaldo   = null;
  }

  function _renderTarefaFirestore(docSnap, uid) {
    const dados = docSnap.data();
    const id    = docSnap.id;
    if (document.querySelector(`[data-task-id="${id}"]`)) return;

    const hoje      = new Date().toISOString().split('T')[0];
    const feitoHoje = dados.concluidaPor?.[uid] === hoje;
    const tagTexto  = dados.tipo === 'pontual'
      ? `a cada ${dados.ciclo} dia${dados.ciclo > 1 ? 's' : ''}`
      : 'diária';

    const item = document.createElement('div');
    item.className      = 'task-item';
    item.dataset.taskId = id;
    item.dataset.grupo  = dados.grupo;
    item.dataset.pts    = dados.pontos;
    item.dataset.action = 'toggle-task';
    item.innerHTML = `
      <div class="task-check ${feitoHoje ? 'done' : ''}"></div>
      <div class="task-item__info">
        <div class="task-item__name ${feitoHoje ? 'done' : ''}">${dados.nome}</div>
        <div class="task-item__tag">${tagTexto}</div>
      </div>
      <span class="task-item__pts">+${dados.pontos}</span>
      <button class="task-item__del" data-action="excluir-tarefa"
              data-task-id="${id}" aria-label="Excluir tarefa">
        <i class="ph ph-trash" aria-hidden="true"></i>
      </button>
    `;
    const body = document.getElementById('body-' + dados.grupo);
    if (body) {
      body.appendChild(item);
      body.classList.add('open');
      document.getElementById('chevron-' + dados.grupo)?.classList.add('open');
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


  function selecionarAvatar(el) {
    document.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    avatarSelecionado = el.dataset.emoji; // ex: 'ph-flower'

    // Atualiza preview e success com a classe Phosphor
    const preview = document.getElementById('previewAvatar');
    const success = document.getElementById('successAvatar');
    if (preview) preview.innerHTML = `<i class="ph ${avatarSelecionado}" aria-hidden="true"></i>`;
    if (success) success.innerHTML = `<i class="ph ${avatarSelecionado}" aria-hidden="true"></i>`;
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
    if (!_autenticado()) return;
    navegar('home');
    atualizarProgresso();
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
    const pts   = parseInt(item.dataset.pts) || 0;
    const done  = check.classList.contains('done');

    if (done) {
      check.classList.remove('done');
      check.innerHTML = '';
      name.classList.remove('done');
      tarefasConcluidas = Math.max(0, tarefasConcluidas - 1);
      if (_fbUid) {
        try {
          if (_fbCasalId) await adicionarSaldoDB(_fbCasalId, _fbUid, -pts, 'desfeito: ' + name.textContent);
          else            await atualizarSaldoUsuarioDB(_fbUid, -pts);
        } catch (err) { console.error(err); }
      }
    } else {
      check.classList.add('done');
      check.innerHTML = '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>';
      name.classList.add('done');
      tarefasConcluidas = Math.min(totalTarefas, tarefasConcluidas + 1);
      if (_fbUid) {
        try {
          if (_fbCasalId) await adicionarSaldoDB(_fbCasalId, _fbUid, pts, name.textContent);
          else            await atualizarSaldoUsuarioDB(_fbUid, pts);
        } catch (err) { console.error(err); }
      }
      mostrarToast('+' + pts + ' moedas');
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

  let pontosSelecionados = 10;
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
  const check = item.querySelector('.task-check');
  const name  = item.querySelector('.task-item__name');
  const pts   = parseInt(item.dataset.pts) || 0;
  const done  = check.classList.contains('done');

  if (done) {
    check.classList.remove('done');
    check.innerHTML = '';
    name.classList.remove('done');
    if (_fbUid) {
      try {
        if (_fbCasalId) await adicionarSaldoDB(_fbCasalId, _fbUid, -pts, 'desfeito: ' + name.textContent);
        else            await atualizarSaldoUsuarioDB(_fbUid, -pts);
      } catch (err) { console.error(err); }
    } else {
      saldoAtual = Math.max(0, saldoAtual - pts);
      atualizarSaldo();
    }
  } else {
    check.classList.add('done');
    check.innerHTML = '<i class="ph-bold ph-check icon-xs" aria-hidden="true"></i>';
    name.classList.add('done');
    if (_fbUid) {
      try {
        if (_fbCasalId) await adicionarSaldoDB(_fbCasalId, _fbUid, pts, name.textContent);
        else            await atualizarSaldoUsuarioDB(_fbUid, pts);
      } catch (err) { console.error(err); }
    } else {
      saldoAtual += pts;
      atualizarSaldo();
    }
    mostrarToast('+' + pts + ' moedas');
  }
  if (item.dataset.grupo) atualizarBadgeGrupo(item.dataset.grupo);
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

    // Reset pontos
    document.querySelectorAll('.pts-opt').forEach(o => o.classList.remove('active'));
    const ptsDefault = document.querySelector('.pts-opt[data-pts="10"]');
    if (ptsDefault) ptsDefault.classList.add('active');
    pontosSelecionados = 10;

    // Reset grupo
    const select = document.getElementById('novaTarefaGrupo');
    if (select) select.value = 'limpeza';
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

    const cicloDias = tipoSelecionado === 'pontual'
      ? parseInt(document.getElementById('cicloDias').value) || 1
      : null;

    // Cria item da tarefa
    const item = document.createElement('div');
    item.className     = 'task-item';
    item.dataset.pts   = pontosSelecionados;
    item.dataset.grupo = grupo;
    item.dataset.tipo  = tipoSelecionado;
    item.dataset.action = 'toggle-task';

    if (tipoSelecionado === 'pontual') {
      item.dataset.ciclo = cicloDias;
      item.dataset.criadaEm = new Date().toISOString();
      item.dataset.proxData = calcularProxData(cicloDias).toISOString();
    }

    const tagTexto = tipoSelecionado === 'pontual'
      ? `a cada ${cicloDias} dia${cicloDias > 1 ? 's' : ''}`
      : 'diária';

    const taskId = 'task-' + Date.now();
    item.dataset.taskId = taskId;
    item.innerHTML = `
      <div class="task-check"></div>
      <div class="task-item__info">
        <div class="task-item__name">${nome}</div>
        <div class="task-item__tag">${tagTexto}</div>
      </div>
      <span class="task-item__pts">+${pontosSelecionados}</span>
      <button class="task-item__del" data-action="excluir-tarefa"
              data-task-id="${taskId}" aria-label="Excluir tarefa">
        <i class="ph ph-trash" aria-hidden="true"></i>
      </button>
    `;

    const body = document.getElementById('body-' + grupo);
    if (body) {
      body.appendChild(item);
      body.classList.add('open');
      document.getElementById('chevron-' + grupo)?.classList.add('open');
    }

    atualizarBadgeGrupo(grupo);
    atualizarResumoDia();
    verificarAtrasadas();
    fecharModalNovaTarefa();
    mostrarToast('tarefa criada');
    // Salvar no Firestore
    if (_fbCasalId) {
      criarTarefaDB(_fbCasalId, {
        nome, grupo,
        tipo: tipoSelecionado,
        pontos: pontosSelecionados,
        ciclo: tipoSelecionado === 'pontual' ? cicloDias : null,
        proxData: tipoSelecionado === 'pontual' ? calcularProxData(cicloDias).toISOString() : null,
      }).catch(console.error);
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
      () => {
        item.remove();
        atualizarBadgeGrupo(grupo);
        atualizarResumoDia();
        mostrarToast(`"${nome}" excluída`);
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
      // dias anteriores — checar no histórico simplificado
      const idx = exEstado.historico[dia.getDate() - 1];
      dotClass += idx === false ? ' ex-cal-day__dot--miss' : ' ex-cal-day__dot--done';
      conteudo = idx === false
        ? '<i class="ph-bold ph-x" aria-hidden="true"></i>'
        : '<i class="ph-bold ph-check" aria-hidden="true"></i>';
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

    // Perfil e logout
    'ir-perfil':                    () => irParaPerfil(),
    'copiar-codigo-perfil':         () => copiarCodigoPerfil(),
    'confirmar-logout':             () => abrirModal('modalLogout'),
    'fechar-logout':                () => fecharModal('modalLogout'),
    'fazer-logout':                 () => fazerLogout(),

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

});