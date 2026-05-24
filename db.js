const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "donuts.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, history: {} }, null, 2), "utf8");
  }
}

function readDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_FILE, "utf8");
  const db = JSON.parse(raw);
  db.users ??= {};
  db.history ??= {};
  return db;
}

function writeDb(data) {
  ensureDataFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getTierTitle(count) {
  if (count <= 0) return "Gluten Free";
  if (count <= 5) return "Donut Rookie";
  if (count <= 10) return "Donut Boy/Girl";
  if (count <= 15) return "Donut Man/Woman";
  if (count <= 20) return "Donut Enjoyer";
  if (count <= 25) return "Donut Specialist";
  if (count <= 30) return "Glazed Apprentice";
  if (count <= 35) return "Frosted Warrior";
  if (count <= 40) return "Sprinkle Soldier";
  if (count <= 45) return "Jelly-Filled Threat";
  if (count <= 50) return "Deep Fried Veteran";
  if (count <= 55) return "Donut Master";
  if (count <= 60) return "Grand Glazer";
  if (count <= 65) return "Supreme Sprinkle Lord";
  if (count <= 70) return "Hole Commander";
  if (count <= 80) return "Bakery General";
  if (count <= 90) return "Mythical Donut Entity";
  if (count <= 100) return "Ascended Pastry Being";
  if (count <= 110) return "Glucose Overlord";
  if (count <= 120) return "Celestial Pastry";
  if (count <= 130) return "Donut Demigod";
  return "The Chosen Donut";
}

function ensureUser(userId, username) {
  const db = readDb();
  if (!db.users[userId]) {
    db.users[userId] = {
      user_id: userId,
      username,
      count: 0,
      updated_at: new Date().toISOString(),
    };
    writeDb(db);
  }
}

async function getUserCount(userId) {
  const db = readDb();
  return db.users[userId]?.count ?? 0;
}

async function addDonuts(userId, username, amount) {
  ensureUser(userId, username);
  const db = readDb();

  db.users[userId].count += amount;
  db.users[userId].username = username;
  db.users[userId].updated_at = new Date().toISOString();
  addHistoryPoint(db, userId, db.users[userId].count, "adddonut", db.users[userId].updated_at);

  writeDb(db);
  return db.users[userId].count;
}

async function setDonuts(userId, username, amount) {
  ensureUser(userId, username);
  const db = readDb();

  db.users[userId].count = amount;
  db.users[userId].username = username;
  db.users[userId].updated_at = new Date().toISOString();
  addHistoryPoint(db, userId, db.users[userId].count, "setdonut", db.users[userId].updated_at);

  writeDb(db);
  return db.users[userId].count;
}

function addHistoryPoint(db, userId, count, source, at = new Date().toISOString()) {
  db.history ??= {};
  db.history[userId] ??= [];

  const point = {
    at,
    count,
    source,
  };

  const existingIndex = db.history[userId].findIndex((entry) => entry.at === at);
  if (existingIndex === -1) {
    db.history[userId].push(point);
  } else {
    db.history[userId][existingIndex] = point;
  }

  db.history[userId].sort((a, b) => new Date(a.at) - new Date(b.at));
}

async function recordUserHistoryPoint(userId, count, source, at = new Date().toISOString()) {
  const db = readDb();
  addHistoryPoint(db, userId, count, source, at);
  writeDb(db);
  return db.history[userId];
}

async function replaceUserHistoryFromScan(userId, points) {
  const db = readDb();
  db.history ??= {};

  const manualPoints = (db.history[userId] ?? []).filter(
    (point) => point.source !== "history-scan"
  );

  const byKey = new Map();
  for (const point of [...manualPoints, ...points]) {
    byKey.set(`${point.at}:${point.count}:${point.source}`, point);
  }

  db.history[userId] = [...byKey.values()].sort(
    (a, b) => new Date(a.at) - new Date(b.at)
  );

  writeDb(db);
  return db.history[userId];
}

async function getUserHistory(userId) {
  const db = readDb();
  return db.history[userId] ?? [];
}

async function removeUser(userId) {
  const db = readDb();
  const user = db.users[userId] ?? null;

  if (!user) return null;

  delete db.users[userId];
  writeDb(db);
  return user;
}

async function cleanupUsers(predicate, commit = false) {
  const db = readDb();
  const removed = Object.values(db.users).filter(predicate);

  if (commit && removed.length > 0) {
    for (const user of removed) {
      delete db.users[user.user_id];
    }
    writeDb(db);
  }

  return removed;
}

async function getRank(userId) {
  const db = readDb();
  const rows = Object.values(db.users).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.username.localeCompare(b.username);
  });

  const index = rows.findIndex((r) => r.user_id === userId);
  return index === -1 ? null : index + 1;
}

async function getLeaderboard() {
  const db = readDb();
  return Object.values(db.users)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.username.localeCompare(b.username);
    })
    .slice(0, 10);
}

async function getAllUsers() {
  const db = readDb();
  return Object.values(db.users);
}

module.exports = {
  addDonuts,
  setDonuts,
  removeUser,
  cleanupUsers,
  recordUserHistoryPoint,
  replaceUserHistoryFromScan,
  getUserHistory,
  getUserCount,
  getRank,
  getLeaderboard,
  getAllUsers,
  getTierTitle,
};
