import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, getDoc, updateDoc, deleteDoc, Timestamp, limit, where, increment, writeBatch, getDocs } from "firebase/firestore";

const firebaseConfig = { apiKey: "AIzaSyBsh8HqFP8-M1moGjsZ0TYreXYr0psGBwU", authDomain: "yapin-f3d65.firebaseapp.com", projectId: "yapin-f3d65", storageBucket: "yapin-f3d65.firebasestorage.app", messagingSenderId: "953656576889", appId: "1:953656576889:web:4077e4af001cb0efddfda8", measurementId: "G-PQ7K96Q6E4" };
const CLOUDINARY_CLOUD_NAME = "dpbs080al";
const CLOUDINARY_UPLOAD_PRESET = "yapin_uploads";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function signUp(email: string, password: string, username: string) {
  const uc = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", uc.user.uid), { username, email, bio: "", avatarUrl: null, createdAt: Timestamp.now(), followerCount: 0, followingCount: 0, yapCount: 0, role: "user" });
  return uc.user;
}
export async function login(email: string, password: string) { return (await signInWithEmailAndPassword(auth, email, password)).user; }
export async function logout() { await signOut(auth); }
export function onAuthChange(cb: (u: User | null) => void) { return onAuthStateChanged(auth, cb); }
export async function getCurrentUsername(uid: string): Promise<string> { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? s.data().username || "Anonymous" : "Anonymous"; }
export async function getUserProfile(uid: string) { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { id: s.id, ...s.data() } : null; }

export async function updateProfile(uid: string, data: { bio?: string; avatarUrl?: string; username?: string; socials?: any }) {
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, data);
  if (data.avatarUrl || data.username) {
    const batch = writeBatch(db);
    const yapsQuery = query(collection(db, "yaps"), where("userId", "==", uid));
    const snap = await getDocs(yapsQuery);
    snap.docs.forEach(d => {
      const updateData: any = {};
      if (data.avatarUrl) updateData.avatarUrl = data.avatarUrl;
      if (data.username) updateData.username = data.username;
      batch.update(doc(db, "yaps", d.id), updateData);
    });
    await batch.commit();
  }
}

export async function uploadYap(uid: string, uname: string, uri: string, cap: string, tags: string[], mentions: string[], dur: number) {
  const fd = new FormData(); const ext = uri.split(".").pop() || "m4a";
  fd.append("file", { uri, type: "audio/" + ext, name: "yap_" + Date.now() + "." + ext } as any);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET); fd.append("resource_type", "video");
  const r = await fetch("https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + "/upload", { method: "POST", body: fd });
  const d = await r.json(); if (!d.secure_url) throw new Error(d.error?.message || "Upload failed");
  const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  await addDoc(collection(db, "yaps"), { userId: uid, username: uname, avatarUrl: av, audioUrl: d.secure_url, caption: cap, hashtags: tags.map(t => t.toLowerCase()), mentions, duration: dur, echoCount: 0, convoCount: 0, likeCount: 0, createdAt: Timestamp.now(), echoedYapId: null });
  await updateDoc(doc(db, "users", uid), { yapCount: increment(1) });
  return d.secure_url;
}

export async function deleteYap(yapId: string, uid: string) {
  const yapRef = doc(db, "yaps", yapId);
  const snap = await getDoc(yapRef);
  if (snap.exists() && snap.data().userId === uid) {
    await deleteDoc(yapRef);
    await updateDoc(doc(db, "users", uid), { yapCount: increment(-1) });
  } else {
    throw new Error("Unauthorized");
  }
}

export function listenToFeed(cb: (yaps: any[]) => void) { return onSnapshot(query(collection(db, "yaps"), orderBy("createdAt", "desc"), limit(50)), (s) => { cb(s.docs.map(d => ({ id: d.id, ...d.data() }))); }); }
export function listenToFollowingFeed(uid: string, cb: (yaps: any[]) => void) { return onSnapshot(collection(db, "users", uid, "following"), (s) => { const ids = s.docs.map(d => d.id); if (ids.length === 0) { cb([]); return; } return onSnapshot(query(collection(db, "yaps"), orderBy("createdAt", "desc"), limit(50)), (ys) => { cb(ys.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((y: any) => ids.includes(y.userId))); }); }); }
export function listenToHashtag(tag: string, cb: (yaps: any[]) => void) { return onSnapshot(query(collection(db, "yaps"), where("hashtags", "array-contains", tag.toLowerCase()), orderBy("createdAt", "desc"), limit(50)), (s) => { cb(s.docs.map(d => ({ id: d.id, ...d.data() }))); }); }

export async function followUser(cuid: string, tuid: string) {
  await setDoc(doc(db, "users", cuid, "following", tuid), { followedAt: Timestamp.now() });
  await setDoc(doc(db, "users", tuid, "followers", cuid), { followedAt: Timestamp.now() });
  await updateDoc(doc(db, "users", cuid), { followingCount: increment(1) });
  await updateDoc(doc(db, "users", tuid), { followerCount: increment(1) });
  const un = await getCurrentUsername(cuid); const ud = await getDoc(doc(db, "users", cuid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  await addDoc(collection(db, "notifications"), { type: "follow", fromUserId: cuid, fromUsername: un, fromAvatarUrl: av, toUserId: tuid, read: false, createdAt: Timestamp.now() });
}
export async function unfollowUser(cuid: string, tuid: string) { await deleteDoc(doc(db, "users", cuid, "following", tuid)); await deleteDoc(doc(db, "users", tuid, "followers", cuid)); await updateDoc(doc(db, "users", cuid), { followingCount: increment(-1) }); await updateDoc(doc(db, "users", tuid), { followerCount: increment(-1) }); }
export async function isFollowing(cuid: string, tuid: string): Promise<boolean> { return (await getDoc(doc(db, "users", cuid, "following", tuid))).exists(); }

export async function likeYap(yid: string, uid: string) {
  await setDoc(doc(db, "yaps", yid, "likes", uid), { likedAt: Timestamp.now() }); await updateDoc(doc(db, "yaps", yid), { likeCount: increment(1) });
  const ys = await getDoc(doc(db, "yaps", yid)); const yd = ys.data(); const un = await getCurrentUsername(uid); const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  if (yd && yd.userId !== uid) { await addDoc(collection(db, "notifications"), { type: "like", fromUserId: uid, fromUsername: un, fromAvatarUrl: av, toUserId: yd.userId, yapId: yid, read: false, createdAt: Timestamp.now() }); }
}
export async function unlikeYap(yid: string, uid: string) { await deleteDoc(doc(db, "yaps", yid, "likes", uid)); await updateDoc(doc(db, "yaps", yid), { likeCount: increment(-1) }); }
export async function isLiked(yid: string, uid: string): Promise<boolean> { return (await getDoc(doc(db, "yaps", yid, "likes", uid))).exists(); }

export async function echoYap(uid: string, uname: string, oid: string, cap: string) {
  const oRef = doc(db, "yaps", oid); const oSn = await getDoc(oRef); if (!oSn.exists()) throw new Error("Not found"); const od = oSn.data();
  const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  await addDoc(collection(db, "yaps"), { userId: uid, username: uname, avatarUrl: av, audioUrl: od.audioUrl, caption: cap, hashtags: [], mentions: [], duration: od.duration, echoCount: 0, convoCount: 0, likeCount: 0, createdAt: Timestamp.now(), echoedYapId: oid, echoedUsername: od.username });
  await updateDoc(oRef, { echoCount: increment(1) });
  if (od.userId !== uid) { await addDoc(collection(db, "notifications"), { type: "echo", fromUserId: uid, fromUsername: uname, fromAvatarUrl: av, toUserId: od.userId, yapId: oid, read: false, createdAt: Timestamp.now() }); }
}

export async function addComment(yid: string, uid: string, uname: string, type: string, content: string, dur?: number) {
  const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  await addDoc(collection(db, "yaps", yid, "convos"), { userId: uid, username: uname, avatarUrl: av, type, content, duration: dur || 0, likeCount: 0, echoCount: 0, createdAt: Timestamp.now() });
  await updateDoc(doc(db, "yaps", yid), { convoCount: increment(1) });
  const ys = await getDoc(doc(db, "yaps", yid)); const yd = ys.data();
  if (yd && yd.userId !== uid) { await addDoc(collection(db, "notifications"), { type: "comment", fromUserId: uid, fromUsername: uname, fromAvatarUrl: av, toUserId: yd.userId, yapId: yid, read: false, createdAt: Timestamp.now() }); }
}
export async function likeComment(yid: string, cid: string, uid: string) { await setDoc(doc(db, "yaps", yid, "convos", cid, "likes", uid), { likedAt: Timestamp.now() }); await updateDoc(doc(db, "yaps", yid, "convos", cid), { likeCount: increment(1) }); }
export async function unlikeComment(yid: string, cid: string, uid: string) { await deleteDoc(doc(db, "yaps", yid, "convos", cid, "likes", uid)); await updateDoc(doc(db, "yaps", yid, "convos", cid), { likeCount: increment(-1) }); }
export async function isCommentLiked(yid: string, cid: string, uid: string): Promise<boolean> { return (await getDoc(doc(db, "yaps", yid, "convos", cid, "likes", uid))).exists(); }
export async function echoComment(yid: string, cid: string, uid: string, uname: string) { const cs = await getDoc(doc(db, "yaps", yid, "convos", cid)); if (!cs.exists()) return; const c = cs.data(); const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null; await addDoc(collection(db, "yaps"), { userId: uid, username: uname, avatarUrl: av, audioUrl: c.type === "voice" ? c.content : "", caption: c.type === "text" ? c.content : "", hashtags: [], mentions: [], duration: c.duration || 0, echoCount: 0, convoCount: 0, likeCount: 0, createdAt: Timestamp.now(), echoedYapId: yid, echoedUsername: c.username }); await updateDoc(doc(db, "yaps", yid, "convos", cid), { echoCount: increment(1) }); }
export function listenToConvo(yid: string, cb: (comments: any[]) => void) { return onSnapshot(query(collection(db, "yaps", yid, "convos"), orderBy("createdAt", "asc")), (s) => { cb(s.docs.map(d => ({ id: d.id, ...d.data() }))); }); }
export function listenToNotifications(uid: string, cb: (notifs: any[]) => void) { return onSnapshot(query(collection(db, "notifications"), where("toUserId", "==", uid), orderBy("createdAt", "desc"), limit(30)), (s) => { cb(s.docs.map(d => ({ id: d.id, ...d.data() }))); }); }
export async function markNotificationsAsRead(uid: string) { const q = query(collection(db, "notifications"), where("toUserId", "==", uid), where("read", "==", false)); const snap = await getDocs(q); const b = writeBatch(db); snap.docs.forEach(d => b.update(doc(db, "notifications", d.id), { read: true })); await b.commit(); }
export async function addReaction(yid: string, uid: string, reaction: string) { await setDoc(doc(db, "yaps", yid, "reactions", uid), { reaction, createdAt: Timestamp.now() }); }
