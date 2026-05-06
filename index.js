require('dotenv').config();
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require('discord.js');

const db = require('./database');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID;

client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);

  // ⏰ Daily report (24h)
  setInterval(() => {
    sendDailyReport();
  }, 24 * 60 * 60 * 1000);
});

// 🧾 Invoice system
function getInvoice() {
  const data = JSON.parse(fs.readFileSync('./invoice.json', 'utf8'));
  const id = data.invoice;
  data.invoice++;
  fs.writeFileSync('./invoice.json', JSON.stringify(data, null, 2));
  return id;
}

// 💾 Save to database
function saveInvoice(customer, staff, total) {
  db.run(
    `INSERT INTO invoices (customer, staff, total, time) VALUES (?, ?, ?, ?)`,
    [customer, staff, total, Date.now()]
  );
}

// ---------------- COMMANDS ---------------- //

client.on('interactionCreate', async interaction => {

  if (!interaction.isChatInputCommand()) return;

  try {

    // 🧾 LOG
    if (interaction.commandName === 'log') {

      await interaction.deferReply();

      const invoice = getInvoice();
      const customer = interaction.options.getString('customer');

      const services = {
        semi_service: interaction.options.getString('semi_service'),
        full_service: interaction.options.getString('full_service'),
        semi_body: interaction.options.getString('semi_body'),
        full_body: interaction.options.getString('full_body'),
        paint_job: interaction.options.getString('paint_job'),
        emergency_repair: interaction.options.getString('emergency_repair'),
        semi_core: interaction.options.getString('semi_core'),
        full_core: interaction.options.getString('full_core')
      };

      const prices = {
        semi_service: 5000,
        full_service: 10000,
        semi_body: 10000,
        full_body: 15000,
        paint_job: 10000,
        emergency_repair: 15000,
        semi_core: 10000,
        full_core: 15000
      };

      let total = 0;

      for (let key in prices) {
        if (services[key] === 'Yes') total += prices[key];
      }

      saveInvoice(customer, interaction.user.id, total);

      const embed = new EmbedBuilder()
        .setTitle(`🧾 Mechanic Invoice #${invoice}`)
        .setColor(0x2ecc71)
        .setDescription(
`👤 Customer: ${customer}
👨‍🔧 Staff: <@${interaction.user.id}>

💰 Total: ₹${total.toLocaleString()}`
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 🚗 FULL UPGRADE
    if (interaction.commandName === 'fullupgrade') {

      await interaction.deferReply();

      const invoice = getInvoice();
      const customer = interaction.options.getString('customer');
      const type = interaction.options.getString('vehicle_type');
      const price = interaction.options.getInteger('vehicle_price');

      let final = type === 'addon'
        ? Math.floor(price * 0.45)
        : Math.floor(price * 0.35);

      saveInvoice(customer, interaction.user.id, final);

      const embed = new EmbedBuilder()
        .setTitle(`🚗 Upgrade Invoice #${invoice}`)
        .setColor(0x3498db)
        .setDescription(
`👤 Customer: ${customer}
🚗 Type: ${type.toUpperCase()}
💰 Final: ₹${final.toLocaleString()}`
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 📊 REVENUE
    if (interaction.commandName === 'revenue') {

      await interaction.deferReply();

      db.all(`SELECT * FROM invoices`, [], (err, rows) => {

        let total = 0;
        let weekly = 0;
        let monthly = 0;

        const now = Date.now();
        const week = 7 * 24 * 60 * 60 * 1000;
        const month = 30 * week;

        rows.forEach(r => {
          total += r.total;

          if (now - r.time <= week) weekly += r.total;
          if (now - r.time <= month) monthly += r.total;
        });

        const embed = new EmbedBuilder()
          .setTitle("📊 Revenue Report")
          .setColor(0xf1c40f)
          .addFields(
            { name: "💰 Total", value: `₹${total.toLocaleString()}`, inline: true },
            { name: "📅 Weekly", value: `₹${weekly.toLocaleString()}`, inline: true },
            { name: "🗓 Monthly", value: `₹${monthly.toLocaleString()}`, inline: true }
          );

        return interaction.editReply({ embeds: [embed] });
      });
    }

    // 🏆 LEADERBOARD (TOP 30)
    if (interaction.commandName === 'leaderboard') {

      await interaction.deferReply();

      db.all(`
        SELECT customer, SUM(total) AS spent, COUNT(*) AS visits
        FROM invoices
        GROUP BY customer
        ORDER BY spent DESC
        LIMIT 30
      `, [], (err, rows) => {

        let text = "";

        rows.forEach((r, i) => {
          text += `**#${i + 1} ${r.customer}**
💰 ₹${r.spent.toLocaleString()}
📅 Visits: ${r.visits}

`;
        });

        const embed = new EmbedBuilder()
          .setTitle("🏆 Top 30 Customers")
          .setColor(0xf1c40f)
          .setDescription(text || "No data found")
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      });
    }

    // 👤 CUSTOMER REPORT
    if (interaction.commandName === 'customer') {

      await interaction.deferReply();

      const name = interaction.options.getString('name');

      db.all(`SELECT * FROM invoices WHERE customer = ?`, [name], (err, rows) => {

        if (!rows.length)
          return interaction.editReply("❌ No customer found");

        let total = 0;

        rows.forEach(r => total += r.total);

        const last = new Date(rows[rows.length - 1].time).toLocaleDateString();

        const embed = new EmbedBuilder()
          .setTitle("👤 Customer Report")
          .setColor(0x3498db)
          .addFields(
            { name: "📅 Visits", value: `${rows.length}`, inline: true },
            { name: "💰 Total", value: `₹${total.toLocaleString()}`, inline: true },
            { name: "📊 Last Visit", value: last, inline: false }
          );

        return interaction.editReply({ embeds: [embed] });
      });
    }

  } catch (err) {
    console.error(err);
  }
});

// 📊 DAILY REPORT SYSTEM
function sendDailyReport() {

  const channel = client.channels.cache.get(REPORT_CHANNEL_ID);
  if (!channel) return;

  db.all(`SELECT * FROM invoices`, [], (err, rows) => {

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    let revenue = 0;
    let count = 0;
    const map = {};

    rows.forEach(r => {

      if (now - r.time <= day) {
        revenue += r.total;
        count++;

        map[r.customer] = (map[r.customer] || 0) + 1;
      }
    });

    let top = "None";
    let max = 0;

    for (let c in map) {
      if (map[c] > max) {
        max = map[c];
        top = c;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("📊 DAILY REPORT")
      .setColor(0x00ff99)
      .addFields(
        { name: "💰 Revenue", value: `₹${revenue.toLocaleString()}`, inline: true },
        { name: "🧾 Invoices", value: `${count}`, inline: true },
        { name: "👤 Top Customer", value: `${top} (${max})`, inline: false }
      )
      .setTimestamp();

    channel.send({ embeds: [embed] });
  });
}

client.login(process.env.TOKEN);