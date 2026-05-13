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

export async function marcarTarefaDB(cId, tarefaId, uid, feito) {
  const hoje = new Date().toISOString().split('T')[0];
  await updateDoc(doc(db, 'casais', cId, 'tarefas', tarefaId), {
    [`concluidaPor.${uid}`]: feito ? hoje : null
  });
}

export function ouvirTarefas(cId, callback) {
  return onSnapshot(collection(db, 'casais', cId, 'tarefas'), callback);
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
  await updateDoc(doc(db, 'casais', cId, 'loja', itemId), { resgatadoPor: uid });
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