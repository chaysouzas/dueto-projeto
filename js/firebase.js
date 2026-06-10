// ============================================================
// DUETO — firebase.js
// Inicialização do Firebase + helpers de Auth e Firestore
// ============================================================

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged,
         signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         signInWithPopup, GoogleAuthProvider,
         sendPasswordResetEmail, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc,
         collection, addDoc, onSnapshot, query, where,
         serverTimestamp, deleteDoc, arrayUnion, increment, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Config ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBWNawV719fX-ZdBZRZfrJ5T4BkWsdk6rk",
  authDomain:        "dueto-app-1974c.firebaseapp.com",
  projectId:         "dueto-app-1974c",
  storageBucket:     "dueto-app-1974c.firebasestorage.app",
  messagingSenderId: "410032498976",
  appId:             "1:410032498976:web:a7cc2c81d576d392ef4f45"
};

const app    = initializeApp(firebaseConfig);
const auth   = getAuth(app);
const db     = getFirestore(app);
const google = new GoogleAuthProvider();

// Retorna 'YYYY-MM-DD' no fuso local do dispositivo (evita bug UTC em UTC-x)
function _dataLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Estado global ─────────────────────────────────────────────
export let usuarioAtual = null;
export let dadosUsuario = null;
export let casalId      = null;

// ── Auth ─────────────────────────────────────────────────────

export async function loginEmail(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

export async function loginComGoogle() {
  const cred = await signInWithPopup(auth, google);
  return cred.user;
}

export async function recuperarSenha(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function logout() {
  await signOut(auth);
}

export async function cadastrarEmail(email, senha) {
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

// ── Perfil ───────────────────────────────────────────────────

export function gerarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'DU·';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function atualizarAvatar(uid, dataUrl) {
  await updateDoc(doc(db, 'usuarios', uid), { avatar: dataUrl });
}

export async function criarPerfil(uid, { nome, avatar, cor }) {
  const codigo = gerarCodigo();
  await setDoc(doc(db, 'usuarios', uid), {
    nome, avatar, cor, codigo,
    parceiroUid: null,
    casalId: null,
    saldo: 0,
    criadoEm: serverTimestamp()
  });
  return codigo;
}

export async function buscarPerfil(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function buscarPorCodigo(codigo) {
  const q = query(collection(db, 'usuarios'), where('codigo', '==', codigo.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() };
}

export async function conectarParceiro(meuUid, parceiroUid) {
  const casalRef = await addDoc(collection(db, 'casais'), {
    uid1: meuUid, uid2: parceiroUid,
    criadoEm: serverTimestamp()
  });
  const cId = casalRef.id;
  await updateDoc(doc(db, 'usuarios', meuUid),      { parceiroUid, casalId: cId });
  await updateDoc(doc(db, 'usuarios', parceiroUid), { parceiroUid: meuUid, casalId: cId });
  await inicializarLojaCasal(cId);
  return cId;
}

async function inicializarLojaCasal(_cId) {}

// ── Tarefas ──────────────────────────────────────────────────

export async function criarTarefaDB(cId, tarefa) {
  return await addDoc(collection(db, 'casais', cId, 'tarefas'), {
    ...tarefa, concluidaPor: {}, criadoEm: serverTimestamp()
  });
}

export async function excluirTarefaDB(cId, tarefaId) {
  await deleteDoc(doc(db, 'casais', cId, 'tarefas', tarefaId));
}

export async function marcarTarefaDB(cId, tarefaId, uid, feito, tipo, ciclo) {
  const hoje = _dataLocal();
  const dados = { [`concluidaPor.${uid}`]: feito ? hoje : null };
  if (tipo === 'pontual' && ciclo) {
    const prox = new Date();
    prox.setDate(prox.getDate() + (feito ? Number(ciclo) : 0));
    dados.proxData = prox.toISOString();
  }
  await updateDoc(doc(db, 'casais', cId, 'tarefas', tarefaId), dados);
}

export function ouvirTarefas(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'tarefas'), callback);
}

// ── Tarefas solo (sem parceiro) ──────────────────────────────
export async function criarTarefaSoloDB(uid, tarefa) {
  return await addDoc(collection(db, 'usuarios', uid, 'tarefas'), {
    ...tarefa, concluidaPor: {}, criadoEm: serverTimestamp()
  });
}

export async function excluirTarefaSoloDB(uid, tarefaId) {
  await deleteDoc(doc(db, 'usuarios', uid, 'tarefas', tarefaId));
}

export async function marcarTarefaSoloDB(uid, tarefaId, feito, tipo, ciclo) {
  const hoje = _dataLocal();
  const dados = { [`concluidaPor.${uid}`]: feito ? hoje : null };
  if (tipo === 'pontual' && ciclo) {
    const prox = new Date();
    prox.setDate(prox.getDate() + (feito ? Number(ciclo) : 0));
    dados.proxData = prox.toISOString();
  }
  await updateDoc(doc(db, 'usuarios', uid, 'tarefas', tarefaId), dados);
}

export function ouvirTarefasSolo(uid, callback) {
  return onSnapshot(collection(db, 'usuarios', uid, 'tarefas'), callback);
}

// ── Exercícios ───────────────────────────────────────────────

export async function salvarExercicioDB(cId, uid, dados) {
  await setDoc(doc(db, 'casais', cId, 'exercicios', uid),
    { ...dados, atualizadoEm: serverTimestamp() },
    { merge: true }
  );
}

export function ouvirExercicios(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'exercicios'), callback);
}

// ── Loja ─────────────────────────────────────────────────────

export async function criarItemLojaDB(cId, uid, item) {
  return await addDoc(collection(db, 'casais', cId, 'loja'), {
    ...item, criadoPor: uid,
    resgatadoPor: null, confirmadoPor: [],
    criadoEm: serverTimestamp()
  });
}

export async function excluirItemLojaDB(cId, itemId) {
  await deleteDoc(doc(db, 'casais', cId, 'loja', itemId));
}

export async function resgatarItemDB(cId, uid, itemId, custo) {
  await updateDoc(doc(db, 'casais', cId, 'loja', itemId), { resgatadoPor: uid, resgatadoEm: Date.now() });
  await updateDoc(doc(db, 'usuarios', uid), { saldo: increment(-custo) });
}

export async function confirmarResgateCasalDB(cId, uid, itemId, metade) {
  await updateDoc(doc(db, 'casais', cId, 'loja', itemId), {
    confirmadoPor: arrayUnion(uid)
  });
  await updateDoc(doc(db, 'usuarios', uid), { saldo: increment(-metade) });
}

export function ouvirLoja(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'loja'), callback);
}

// ── Saldo ────────────────────────────────────────────────────

export async function adicionarSaldoDB(cId, uid, pontos, descricao) {
  await updateDoc(doc(db, 'usuarios', uid), { saldo: increment(pontos) });
  await addDoc(collection(db, 'casais', cId, 'transacoes'), {
    uid, tipo: 'ganho', valor: pontos, descricao,
    criadoEm: serverTimestamp()
  });
}

export async function atualizarSaldoUsuarioDB(uid, pontos) {
  await updateDoc(doc(db, 'usuarios', uid), { saldo: increment(pontos) });
}

export function ouvirSaldo(uid, callback) {
  return onSnapshot(doc(db, 'usuarios', uid), (snap) => {
    if (snap.exists()) callback(snap.data().saldo ?? 0);
  });
}

// ── Lugares (casal) ──────────────────────────────────────────

export async function adicionarLugarDB(cId, uid, lugar) {
  return await addDoc(collection(db, 'casais', cId, 'lugares'), {
    ...lugar, adicionadoPor: uid, criadoEm: serverTimestamp()
  });
}
export async function excluirLugarDB(cId, lugarId) {
  await deleteDoc(doc(db, 'casais', cId, 'lugares', lugarId));
}
export async function adicionarAoCofrinhoDb(cId, lugarId, uid, valor) {
  await updateDoc(doc(db, 'casais', cId, 'lugares', lugarId), {
    [`cofrinho.${uid}`]: increment(valor)
  });
}
export function ouvirLugares(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'lugares'), callback);
}

// ── Lugares (solo) ────────────────────────────────────────────

export async function adicionarLugarSoloDB(uid, lugar) {
  return await addDoc(collection(db, 'usuarios', uid, 'lugares'), {
    ...lugar, adicionadoPor: uid, criadoEm: serverTimestamp()
  });
}
export async function excluirLugarSoloDB(uid, lugarId) {
  await deleteDoc(doc(db, 'usuarios', uid, 'lugares', lugarId));
}
export async function adicionarAoCofrinhoSoloDB(ownUid, lugarId, uid, valor) {
  await updateDoc(doc(db, 'usuarios', ownUid, 'lugares', lugarId), {
    [`cofrinho.${uid}`]: increment(valor)
  });
}
export function ouvirLugaresSolo(uid, callback) {
  return onSnapshot(collection(db, 'usuarios', uid, 'lugares'), callback);
}

// ── Receitas (casal) ─────────────────────────────────────────

export async function adicionarReceitaDB(cId, uid, receita) {
  return await addDoc(collection(db, 'casais', cId, 'receitas'), {
    ...receita, adicionadoPor: uid, criadoEm: serverTimestamp()
  });
}
export async function excluirReceitaDB(cId, receitaId) {
  await deleteDoc(doc(db, 'casais', cId, 'receitas', receitaId));
}
export function ouvirReceitas(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'receitas'), callback);
}

// ── Receitas (solo) ───────────────────────────────────────────

export async function adicionarReceitaSoloDB(uid, receita) {
  return await addDoc(collection(db, 'usuarios', uid, 'receitas'), {
    ...receita, adicionadoPor: uid, criadoEm: serverTimestamp()
  });
}
export async function excluirReceitaSoloDB(uid, receitaId) {
  await deleteDoc(doc(db, 'usuarios', uid, 'receitas', receitaId));
}
export function ouvirReceitasSolo(uid, callback) {
  return onSnapshot(collection(db, 'usuarios', uid, 'receitas'), callback);
}

// ── Filmes (casal) ───────────────────────────────────────────

export async function adicionarFilmeDB(cId, uid, filme) {
  return await addDoc(collection(db, 'casais', cId, 'filmes'), {
    ...filme, adicionadoPor: uid, assistido: false,
    assistidoEm: null, avaliacoes: {}, criadoEm: serverTimestamp()
  });
}
export async function marcarFilmeAssistidoDB(cId, filmeId) {
  await updateDoc(doc(db, 'casais', cId, 'filmes', filmeId), {
    assistido: true, assistidoEm: new Date().toISOString().split('T')[0]
  });
}
export async function avaliarFilmeDB(cId, filmeId, uid, nota) {
  await updateDoc(doc(db, 'casais', cId, 'filmes', filmeId), { [`avaliacoes.${uid}`]: nota });
}
export async function excluirFilmeDB(cId, filmeId) {
  await deleteDoc(doc(db, 'casais', cId, 'filmes', filmeId));
}
export function ouvirFilmes(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'filmes'), callback);
}

// ── Filmes (solo) ─────────────────────────────────────────────

export async function adicionarFilmeSoloDB(uid, filme) {
  return await addDoc(collection(db, 'usuarios', uid, 'filmes'), {
    ...filme, adicionadoPor: uid, assistido: false,
    assistidoEm: null, avaliacoes: {}, criadoEm: serverTimestamp()
  });
}
export async function marcarFilmeAssistidoSoloDB(uid, filmeId) {
  await updateDoc(doc(db, 'usuarios', uid, 'filmes', filmeId), {
    assistido: true, assistidoEm: new Date().toISOString().split('T')[0]
  });
}
export async function avaliarFilmeSoloDB(uid, filmeId, nota) {
  await updateDoc(doc(db, 'usuarios', uid, 'filmes', filmeId), { [`avaliacoes.${uid}`]: nota });
}
export async function excluirFilmeSoloDB(uid, filmeId) {
  await deleteDoc(doc(db, 'usuarios', uid, 'filmes', filmeId));
}
export function ouvirFilmesSolo(uid, callback) {
  return onSnapshot(collection(db, 'usuarios', uid, 'filmes'), callback);
}

// ── Exercícios (checkin) ─────────────────────────────────────

export async function fazerCheckinDB(uid, streak, ultimoCheckin) {
  await updateDoc(doc(db, 'usuarios', uid), { streakAtual: streak, ultimoCheckin });
}

// ── Parceiro ─────────────────────────────────────────────────

export function ouvirParceiro(uid, callback) {
  return onSnapshot(doc(db, 'usuarios', uid), (snap) => {
    if (snap.exists()) callback({ uid, ...snap.data() });
  });
}

export async function buscarProgressoParceiroHoje(casalId, parceiroUid) {
  const hoje = _dataLocal();
  const snap = await getDocs(collection(db, 'casais', casalId, 'tarefas'));
  const total = snap.size;
  const docsFeitos = snap.docs.filter(d => d.data().concluidaPor?.[parceiroUid] === hoje);
  return {
    total,
    concluidas: docsFeitos.length,
    tarefasConcluidas: docsFeitos.map(d => ({ id: d.id, ...d.data() }))
  };
}

// ── Auth listener ────────────────────────────────────────────

export function iniciarAuthListener(onLogin, onLogout) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      usuarioAtual  = user;
      dadosUsuario  = await buscarPerfil(user.uid);
      casalId       = dadosUsuario?.casalId || null;
      onLogin(user, dadosUsuario);
    } else {
      usuarioAtual = null;
      dadosUsuario = null;
      casalId      = null;
      onLogout();
    }
  });
}

export { db, auth };