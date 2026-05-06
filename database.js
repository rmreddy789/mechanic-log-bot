const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./mechanic.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer TEXT,
      staff TEXT,
      total INTEGER,
      time INTEGER
    )
  `);
});

module.exports = db;