const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("/app/data/donuts.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS donut_counts (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function getTierTitle(count) {
  if (count <= 0) return "Unranked Pastry";
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

function getUserCount(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT count FROM donut_counts WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.count : 0);
      }
    );
  });
}

function ensureUser(userId, username) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO donut_counts (user_id, username, count)
       VALUES (?, ?, 0)`,
      [userId, username],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function addDonuts(userId, username, amount) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureUser(userId, username);
      db.run(
        `UPDATE donut_counts
         SET count = count + ?, username = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [amount, username, userId],
        async (err) => {
          if (err) {
            reject(err);
          } else {
            const count = await getUserCount(userId);
            resolve(count);
          }
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

function setDonuts(userId, username, amount) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureUser(userId, username);
      db.run(
        `UPDATE donut_counts
         SET count = ?, username = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [amount, username, userId],
        (err) => {
          if (err) reject(err);
          else resolve(amount);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

function getRank(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id, username, count
       FROM donut_counts
       ORDER BY count DESC, username ASC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        const index = rows.findIndex((r) => r.user_id === userId);
        resolve(index === -1 ? null : index + 1);
      }
    );
  });
}

function getLeaderboard() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id, username, count
       FROM donut_counts
       ORDER BY count DESC, username ASC
       LIMIT 10`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

module.exports = {
  addDonuts,
  setDonuts,
  getUserCount,
  getRank,
  getLeaderboard,
  getTierTitle,
};