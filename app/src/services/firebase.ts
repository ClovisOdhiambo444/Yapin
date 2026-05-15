import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, getDoc, updateDoc, deleteDoc, Timestamp, limit, where, increment, writeBatch, getDocs } from "firebase/firestore";

const firebaseConfig = { apiKey: "AIzaSyBsh8HqFP8-M1moGjsZ0TYreXYr0psGBwU", authDomain: "yapin-f3d65.firebaseapp.com", projectId: "yapin-f3d65", storageBucket: "yapin-f3d65.firebasestorage.app", messagingSenderId: "953656576889", appId: "1:953656576889:web:4077e4af001cb0efddfda8", measurementId: "G-PQ7K96Q6E4" };
const CLOUDINARY_CLOUD_NAME = "dpbs080al";
const CLOUDINARY_UPLOAD_PRESET = "yapin_uploads";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function signUp(email: string, password: string, username: string) { const uc = await createUserWithEmailAndPassword(auth, email, password); await setDoc(doc(db, "users", uc.user.uid), { username, email, bio: "", avatarUrl: null, createdAt: Timestamp.now(), followerCount: 0, followingCount: 0, yapCount: 0 }); return uc.user; }
export async function login(email: string, password: string) { return (await signInWithEmailAndPassword(auth, email, password)).user; }
export async function logout() { await signOut(auth); }
export function onAuthChange(cb: (u: User | null) => void) { return onAuthStateChanged(auth, cb); }
export async function getCurrentUsername(uid: string): Promise<string> { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? s.data().username || "Anonymous" : "Anonymous"; }
export async function getUserProfile(uid: string) { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { id: s.id, ...s.data() } : null; }

export async function updateProfile(uid: string, data: { bio?: string; avatarUrl?: string; username?: string; socials?: any }) {
  await updateDoc(doc(db, "users", uid), data);
  if (data.avatarUrl || data.username) {
    const batch = writeBatch(db);
    const yapsSnap = await getDocs(query(collection(db, "yaps"), where("userId", "==", uid)));
    yapsSnap.docs.forEach(d => { const u: any = {}; if (data.avatarUrl) u.avatarUrl = data.avatarUrl; if (data.username) u.username = data.username; batch.update(doc(db, "yaps", d.id), u); });
    const allYaps = await getDocs(collection(db, "yaps"));
    for (const yd of allYaps.docs) { const cs = await getDocs(query(collection(db, "yaps", yd.id, "convos"), where("userId", "==", uid))); cs.docs.forEach(c => { const u: any = {}; if (data.avatarUrl) u.avatarUrl = data.avatarUrl; if (data.username) u.username = data.username; batch.update(doc(db, "yaps", yd.id, "convos", c.id), u); }); }
    await batch.commit();
  }
}

export async function uploadYap(uid: string, uname: string, uri: string, cap: string, tags: string[], mentions: string[], dur: number) {
  const fd = new FormData(); const ext = uri.split(".").pop() || "m4a"; fd.append("file", { uri, type: "audio/" + ext, name: "yap_" + Date.now() + "." + ext } as any); fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET); fd.append("resource_type", "video");
  const r = await fetch("https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + "/upload", { method: "POST", body: fd }); const d = await r.json(); if (!d.secure_url) throw new Error(d.error?.message || "Upload failed");
  const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  const yapRef = await addDoc(collection(db, "yaps"), { userId: uid, username: uname, avatarUrl: av, audioUrl: d.secure_url, caption: cap, hashtags: tags.map(t => t.toLowerCase()), mentions, duration: dur, echoCount: 0, convoCount: 0, likeCount: 0, bookmarkCount: 0, createdAt: Timestamp.now(), echoedYapId: null });
  await updateDoc(doc(db, "users", uid), { yapCount: increment(1) });

  // Send mention notifications
  if (mentions && mentions.length > 0) {
    for (const mentionedUsername of mentions) {
      // Find the user by username
      const q = query(collection(db, "users"), where("username", "==", mentionedUsername));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const targetUser = snap.docs[0];
        if (targetUser.id !== uid) { // don't notify yourself
          await addDoc(collection(db, "notifications"), {
            type: "mention",
            fromUserId: uid,
            fromUsername: uname,
            fromAvatarUrl: av,
            toUserId: targetUser.id,
            yapId: yapRef.id,
            read: false,
            createdAt: Timestamp.now(),
          });
        }
      }
    }
  }

  return d.secure_url;
}

export async function deleteYap(yapId: string, uid: string) { const ref = doc(db, "yaps", yapId); const s = await getDoc(ref); if (s.exists() && s.data().userId === uid) { await deleteDoc(ref); await updateDoc(doc(db, "users", uid), { yapCount: increment(-1) }); } else throw new Error("Unauthorized"); }
export function listenToFeed(cb: (yaps: any[]) => void) { return onSnapshot(query(collection(db, "yaps"), orderBy("createdAt", "desc"), limit(50)), (s) => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToFollowingFeed(uid: string, cb: (yaps: any[]) => void) { return onSnapshot(collection(db, "users", uid, "following"), (s) => { const ids = s.docs.map(d => d.id); if (!ids.length) { cb([]); return; } return onSnapshot(query(collection(db, "yaps"), orderBy("createdAt", "desc"), limit(50)), (ys) => cb(ys.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((y: any) => ids.includes(y.userId)))); }); }
export function listenToHashtag(tag: string, cb: (yaps: any[]) => void) { return onSnapshot(query(collection(db, "yaps"), where("hashtags", "array-contains", tag.toLowerCase()), orderBy("createdAt", "desc"), limit(50)), (s) => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }

export async function followUser(cuid: string, tuid: string) { await setDoc(doc(db, "users", cuid, "following", tuid), { followedAt: Timestamp.now() }); await setDoc(doc(db, "users", tuid, "followers", cuid), { followedAt: Timestamp.now() }); const un = await getCurrentUsername(cuid); const ud = await getDoc(doc(db, "users", cuid)); const av = ud.exists() ? ud.data().avatarUrl || null : null; await addDoc(collection(db, "notifications"), { type: "follow", fromUserId: cuid, fromUsername: un, fromAvatarUrl: av, toUserId: tuid, read: false, createdAt: Timestamp.now() }); }
export async function unfollowUser(cuid: string, tuid: string) { await deleteDoc(doc(db, "users", cuid, "following", tuid)); await deleteDoc(doc(db, "users", tuid, "followers", cuid)); }
export async function isFollowing(cuid: string, tuid: string): Promise<boolean> { return (await getDoc(doc(db, "users", cuid, "following", tuid))).exists(); }

export async function likeYap(yid: string, uid: string) { await setDoc(doc(db, "yaps", yid, "likes", uid), { likedAt: Timestamp.now() }); await updateDoc(doc(db, "yaps", yid), { likeCount: increment(1) }); const ys = await getDoc(doc(db, "yaps", yid)); const yd = ys.data(); const un = await getCurrentUsername(uid); const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null; if (yd && yd.userId !== uid) await addDoc(collection(db, "notifications"), { type: "like", fromUserId: uid, fromUsername: un, fromAvatarUrl: av, toUserId: yd.userId, yapId: yid, read: false, createdAt: Timestamp.now() }); }
export async function unlikeYap(yid: string, uid: string) { await deleteDoc(doc(db, "yaps", yid, "likes", uid)); await updateDoc(doc(db, "yaps", yid), { likeCount: increment(-1) }); }
export async function isLiked(yid: string, uid: string): Promise<boolean> { return (await getDoc(doc(db, "yaps", yid, "likes", uid))).exists(); }

export async function echoYap(uid: string, uname: string, oid: string, cap: string) { const oRef = doc(db, "yaps", oid); const oSn = await getDoc(oRef); if (!oSn.exists()) throw new Error("Not found"); const od = oSn.data(); const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null; await addDoc(collection(db, "yaps"), { userId: uid, username: uname, avatarUrl: av, audioUrl: od.audioUrl, caption: cap, hashtags: [], mentions: [], duration: od.duration, echoCount: 0, convoCount: 0, likeCount: 0, bookmarkCount: 0, createdAt: Timestamp.now(), echoedYapId: oid, echoedUsername: od.username }); await updateDoc(oRef, { echoCount: increment(1) }); if (od.userId !== uid) await addDoc(collection(db, "notifications"), { type: "echo", fromUserId: uid, fromUsername: uname, fromAvatarUrl: av, toUserId: od.userId, yapId: oid, read: false, createdAt: Timestamp.now() }); }

// ── updated comment with mention notifications ──
export async function addComment(yid: string, uid: string, uname: string, type: string, content: string, dur?: number, parentCommentId?: string) {
  const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null;
  // Parse mentions from content if type is text
  let mentions: string[] = [];
  if (type === 'text') {
    const mentionMatches = content.match(/@(\w+)/g);
    if (mentionMatches) {
      mentions = mentionMatches.map(m => m.substring(1));
    }
  }
  const commentRef = await addDoc(collection(db, "yaps", yid, "convos"), { userId: uid, username: uname, avatarUrl: av, type, content, duration: dur || 0, likeCount: 0, echoCount: 0, parentCommentId: parentCommentId || null, mentions, createdAt: Timestamp.now() });
  await updateDoc(doc(db, "yaps", yid), { convoCount: increment(1) });
  const ys = await getDoc(doc(db, "yaps", yid)); const yd = ys.data();
  if (yd && yd.userId !== uid) await addDoc(collection(db, "notifications"), { type: "comment", fromUserId: uid, fromUsername: uname, fromAvatarUrl: av, toUserId: yd.userId, yapId: yid, commentType: type, read: false, createdAt: Timestamp.now() });

  // Send mention notifications for comments
  if (mentions.length > 0) {
    for (const mentionedUsername of mentions) {
      const q = query(collection(db, "users"), where("username", "==", mentionedUsername));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const targetUser = snap.docs[0];
        if (targetUser.id !== uid) {
          await addDoc(collection(db, "notifications"), {
            type: "mention",
            fromUserId: uid,
            fromUsername: uname,
            fromAvatarUrl: av,
            toUserId: targetUser.id,
            yapId: yid,
            read: false,
            createdAt: Timestamp.now(),
          });
        }
      }
    }
  }
}

export async function likeComment(yid: string, cid: string, uid: string) { await setDoc(doc(db, "yaps", yid, "convos", cid, "likes", uid), { likedAt: Timestamp.now() }); await updateDoc(doc(db, "yaps", yid, "convos", cid), { likeCount: increment(1) }); }
export async function unlikeComment(yid: string, cid: string, uid: string) { await deleteDoc(doc(db, "yaps", yid, "convos", cid, "likes", uid)); await updateDoc(doc(db, "yaps", yid, "convos", cid), { likeCount: increment(-1) }); }
export async function isCommentLiked(yid: string, cid: string, uid: string): Promise<boolean> { return (await getDoc(doc(db, "yaps", yid, "convos", cid, "likes", uid))).exists(); }
export async function echoComment(yid: string, cid: string, uid: string, uname: string) { const cs = await getDoc(doc(db, "yaps", yid, "convos", cid)); if (!cs.exists()) return; const c = cs.data(); const ud = await getDoc(doc(db, "users", uid)); const av = ud.exists() ? ud.data().avatarUrl || null : null; await addDoc(collection(db, "yaps"), { userId: uid, username: uname, avatarUrl: av, audioUrl: c.type === "voice" ? c.content : "", caption: c.type === "text" ? c.content : "", hashtags: [], mentions: [], duration: c.duration || 0, echoCount: 0, convoCount: 0, likeCount: 0, bookmarkCount: 0, createdAt: Timestamp.now(), echoedYapId: yid, echoedUsername: c.username }); await updateDoc(doc(db, "yaps", yid, "convos", cid), { echoCount: increment(1) }); }
export function listenToConvo(yid: string, cb: (comments: any[]) => void) { return onSnapshot(query(collection(db, "yaps", yid, "convos"), orderBy("createdAt", "asc")), (s) => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export function listenToNotifications(uid: string, cb: (notifs: any[]) => void) { return onSnapshot(query(collection(db, "notifications"), where("toUserId", "==", uid), orderBy("createdAt", "desc"), limit(30)), (s) => cb(s.docs.map(d => ({ id: d.id, ...d.data() })))); }
export async function markNotificationsAsRead(uid: string) { const q = query(collection(db, "notifications"), where("toUserId", "==", uid), where("read", "==", false)); const s = await getDocs(q); const b = writeBatch(db); s.docs.forEach(d => b.update(doc(db, "notifications", d.id), { read: true })); await b.commit(); }
export async function toggleBookmark(yid: string, uid: string): Promise<boolean> { const bRef = doc(db, "yaps", yid, "bookmarks", uid); const bSnap = await getDoc(bRef); if (bSnap.exists()) { await deleteDoc(bRef); await updateDoc(doc(db, "yaps", yid), { bookmarkCount: increment(-1) }); return false; } else { await setDoc(bRef, { bookmarkedAt: Timestamp.now() }); await updateDoc(doc(db, "yaps", yid), { bookmarkCount: increment(1) }); return true; } }
export async function isBookmarked(yid: string, uid: string): Promise<boolean> { return (await getDoc(doc(db, "yaps", yid, "bookmarks", uid))).exists(); }

export async function findUserByUsername(username: string): Promise<{ id: string } | null> {
  const q = query(collection(db, "users"), where("username", "==", username));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id };
}
