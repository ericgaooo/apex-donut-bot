require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas, loadImage, registerFont } = require("canvas");
const GIFEncoder = require("gif-encoder-2");


registerFont("./assets/fonts/Nunito-Bold.ttf", {
    family: "DonutFont",
    weight: "bold",
  });
  
  registerFont("./assets/fonts/Nunito-Regular.ttf", {
    family: "DonutFont",
    weight: "normal",
  });
  
const {
  addDonuts,
  setDonuts,
  getUserCount,
  getRank,
  getLeaderboard,
  getTierTitle,
} = require("./db");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

async function getServerDisplayName(interaction, user) {
  const member = interaction.options.getMember("user");
  if (member?.displayName) return member.displayName;

  try {
    const fetchedMember = await interaction.guild.members.fetch(user.id);
    return fetchedMember.displayName;
  } catch {
    return user.globalName || user.username;
  }
}

async function getActorDisplayName(interaction) {
  try {
    const fetchedMember = await interaction.guild.members.fetch(interaction.user.id);
    return fetchedMember.displayName;
  } catch {
    return interaction.user.globalName || interaction.user.username;
  }
}

function buildPromotionMessage(displayName, oldTitle, newTitle, total, rank) {
  return (
    `⚠️ **PROMOTION RECORDED** ⚠️\n` +
    `${displayName} has ascended from **${oldTitle}** to **${newTitle}**.\n` +
    `New total: **${total}** donut(s) | Rank: **#${rank}**`
  );
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCircleImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let output = text;
  while (output.length > 0 && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function sanitizeDisplayNameForCanvas(name) {
  if (!name) return name;
  const stripped = name
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return stripped || name;
}

function getRankColors(place) {
  if (place === 1) {
    return {
      rowBg: "#8B3E66",
      accent: "#FFD166",
      badgeBg: "#FFE08A",
      badgeText: "#5B3A00",
      glow: "rgba(255, 209, 102, 0.38)",
      count: "#FFE08A",
    };
  }
  if (place === 2) {
    return {
      rowBg: "#C86D98",
      accent: "#F6E7EE",
      badgeBg: "#FFF5FA",
      badgeText: "#7A4960",
      glow: "rgba(246, 231, 238, 0.30)",
      count: "#FFF2C7",
    };
  }
  if (place === 3) {
    return {
      rowBg: "#D98E78",
      accent: "#F7C59F",
      badgeBg: "#FFD7B8",
      badgeText: "#6E4225",
      glow: "rgba(247, 197, 159, 0.32)",
      count: "#FFF0CF",
    };
  }

  return {
    rowBg: "#E89BC0",
    accent: "#F4B6D2",
    badgeBg: "#FCE7F1",
    badgeText: "#8B4A69",
    glow: "rgba(252, 231, 241, 0.18)",
    count: "#FFF5D6",
  };
}

async function buildLeaderboardEntries(guild, rows) {
  return Promise.all(
    rows.map(async (row, index) => {
      let displayName = row.username;
      let avatarUrl = null;

      try {
        const member = await guild.members.fetch(row.user_id);
        displayName = member.displayName;
        avatarUrl = member.displayAvatarURL({
          extension: "png",
          size: 128,
          forceStatic: true,
        });
      } catch {
        // fallback
      }

      let avatarImage = null;
      if (avatarUrl) {
        try {
          avatarImage = await loadImage(avatarUrl);
        } catch {
          avatarImage = null;
        }
      }

      return {
        place: index + 1,
        displayName,
        canvasDisplayName: sanitizeDisplayNameForCanvas(displayName),
        count: row.count,
        tier: getTierTitle(row.count),
        avatarImage,
      };
    })
  );
}

function createSprinkles(width, height, count, layer = "front") {
  const colors = [
    "#FF4FA3",
    "#FF7EB6",
    "#FF99C8",
    "#FFD166",
    "#FFE29A",
    "#8ED1FC",
    "#B8F2A5",
    "#F7A8B8",
    "#FFFFFF",
    "#F9C74F",
    "#CDB4DB",
    "#FFB703",
  ];

  const front = layer === "front";
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    len: front ? 8 + Math.random() * 16 : 5 + Math.random() * 10,
    thickness: front ? 2.4 + Math.random() * 3 : 1.4 + Math.random() * 2,
    angle: Math.random() * Math.PI,
    speed: front ? 2.2 + Math.random() * 3.8 : 1.0 + Math.random() * 1.8,
    drift: front ? -2.5 + Math.random() * 5 : -1.2 + Math.random() * 2.4,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: front ? 0.98 : 0.62,
  }));
}

function createDonutBubbles(width, height, count) {
  const colors = [
    "rgba(255,255,255,0.16)",
    "rgba(255,238,245,0.26)",
    "rgba(255,214,102,0.16)",
    "rgba(255,170,210,0.20)",
    "rgba(255,120,182,0.14)",
  ];

  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 20 + Math.random() * 58,
    speed: 0.35 + Math.random() * 0.9,
    drift: -0.9 + Math.random() * 1.8,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
}

function createSparkles(width, height, count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: 5 + Math.random() * 11,
    speed: 0.7 + Math.random() * 1.6,
    phase: Math.random() * Math.PI * 2,
  }));
}

function createBurstParticles(width, height, countPerSide = 90) {
  const colors = [
    "#FF4FA3",
    "#FF7EB6",
    "#FF99C8",
    "#FFD166",
    "#FFE29A",
    "#8ED1FC",
    "#B8F2A5",
    "#FFFFFF",
    "#F9C74F",
  ];

  const particles = [];

  function makeParticle(side) {
    const left = side === "left";
    const originX = left ? 42 : width - 42;
    const originY = 92 + Math.random() * 26;

    const angleBase = left ? -0.45 : Math.PI + 0.45;
    const spread = 1.1;
    const angle = angleBase + (Math.random() - 0.5) * spread;

    return {
      originX,
      originY,
      angle,
      speed: 7 + Math.random() * 10,
      gravity: 0.22 + Math.random() * 0.18,
      size: 5 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      rotSpeed: -0.25 + Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 0.72 + Math.random() * 0.26,
      shape: Math.random() > 0.55 ? "rect" : "circle",
    };
  }

  for (let i = 0; i < countPerSide; i++) {
    particles.push(makeParticle("left"));
    particles.push(makeParticle("right"));
  }

  return particles;
}

function drawBurstParticles(ctx, particles, frame) {
  const t = frame * 1.15;

  for (const p of particles) {
    const x = p.originX + Math.cos(p.angle) * p.speed * t;
    const y = p.originY + Math.sin(p.angle) * p.speed * t + p.gravity * t * t;

    const life = Math.max(0, 1 - frame / 24);
    if (life <= 0) continue;

    ctx.save();
    ctx.globalAlpha = p.alpha * life;
    ctx.translate(x, y);
    ctx.rotate(p.rot + frame * p.rotSpeed);
    ctx.fillStyle = p.color;

    if (p.shape === "rect") {
      drawRoundedRect(ctx, -p.size / 2, -p.size / 3, p.size, p.size * 0.66, 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawSprinkles(ctx, sprinkles, frame, width, height) {
  for (const s of sprinkles) {
    const y = (s.y + frame * s.speed * 6) % (height + 40) - 20;
    const x = (s.x + frame * s.drift * 2 + width) % width;
    const dx = Math.cos(s.angle) * s.len;
    const dy = Math.sin(s.angle) * s.len;

    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.thickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFrostingDrips(ctx, width) {
  ctx.save();

  const dripGradient = ctx.createLinearGradient(0, 0, 0, 170);
  dripGradient.addColorStop(0, "rgba(255, 189, 220, 0.76)");
  dripGradient.addColorStop(1, "rgba(255, 189, 220, 0.0)");
  ctx.fillStyle = dripGradient;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, 92);

  const dripCount = 9;
  const section = width / dripCount;

  for (let i = dripCount; i >= 0; i--) {
    const x = i * section;
    const depth = 22 + (i % 3) * 14;
    ctx.quadraticCurveTo(x - section / 2, 95 + depth, x - section, 92);
  }

  ctx.lineTo(0, 92);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDonutBubble(ctx, x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDonutBubbles(ctx, bubbles, frame, width, height) {
  for (const b of bubbles) {
    const y = (b.y + frame * b.speed * 2) % (height + b.r * 2) - b.r;
    const x = (b.x + frame * b.drift + width) % width;
    drawDonutBubble(ctx, x, y, b.r, b.color);
  }
}

function drawSparkle(ctx, x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();

  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.65, y - size * 0.65);
  ctx.lineTo(x + size * 0.65, y + size * 0.65);
  ctx.moveTo(x + size * 0.65, y - size * 0.65);
  ctx.lineTo(x - size * 0.65, y + size * 0.65);
  ctx.stroke();
  ctx.restore();
}

function drawSparkles(ctx, sparkles, frame) {
  for (const s of sparkles) {
    const alpha = 0.22 + (Math.sin(frame * 0.6 + s.phase) + 1) * 0.28;
    drawSparkle(ctx, s.x, s.y, s.size, alpha);
  }
}

function drawBackground(
  ctx,
  width,
  height,
  backSprinkles = null,
  frontSprinkles = null,
  bubbles = null,
  sparkles = null,
  burstParticles = null,
  frame = 0
) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#FFF2F7");
  bg.addColorStop(0.48, "#FFDDEB");
  bg.addColorStop(1, "#FFC4DE");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawFrostingDrips(ctx, width);

  const glow1 = ctx.createRadialGradient(220, 120, 30, 220, 120, 420);
  glow1.addColorStop(0, "rgba(255,255,255,0.55)");
  glow1.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(
    width - 200,
    height - 120,
    40,
    width - 200,
    height - 120,
    360
  );
  glow2.addColorStop(0, "rgba(255, 214, 102, 0.18)");
  glow2.addColorStop(1, "rgba(255, 214, 102, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  if (bubbles) drawDonutBubbles(ctx, bubbles, frame, width, height);
  if (sparkles) drawSparkles(ctx, sparkles, frame);
  if (burstParticles) drawBurstParticles(ctx, burstParticles, frame);
  if (backSprinkles) drawSprinkles(ctx, backSprinkles, frame, width, height);
  if (frontSprinkles) drawSprinkles(ctx, frontSprinkles, frame, width, height);
}

function drawHeaderShimmer(ctx, outerPadding, width, frame) {
  const shimmerX =
    outerPadding - 120 + ((frame % 20) / 19) * (width - outerPadding * 2 + 240);

  ctx.save();
  drawRoundedRect(
    ctx,
    outerPadding,
    outerPadding,
    width - outerPadding * 2,
    96,
    30
  );
  ctx.clip();

  const grad = ctx.createLinearGradient(shimmerX - 140, 0, shimmerX + 140, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.18)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.34)");
  grad.addColorStop(0.65, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(shimmerX - 160, outerPadding, 320, 96);
  ctx.restore();
}

function drawLeaderboardFrame(
  ctx,
  entries,
  width,
  height,
  backSprinkles = null,
  frontSprinkles = null,
  bubbles = null,
  sparkles = null,
  burstParticles = null,
  frame = 0
) {
  const outerPadding = 28;
  const headerHeight = 96;
  const columnHeaderHeight = 44;
  const rowHeight = 76;
  const rowGap = 14;
  const listTop = outerPadding + headerHeight + 8 + columnHeaderHeight;

  drawBackground(
    ctx,
    width,
    height,
    backSprinkles,
    frontSprinkles,
    bubbles,
    sparkles,
    burstParticles,
    frame
  );

  drawRoundedRect(
    ctx,
    outerPadding,
    outerPadding,
    width - outerPadding * 2,
    headerHeight,
    30
  );
  const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
  headerGrad.addColorStop(0, "#F49AC2");
  headerGrad.addColorStop(0.5, "#EC89B6");
  headerGrad.addColorStop(1, "#F7A6C8");
  ctx.fillStyle = headerGrad;
  ctx.fill();

  drawHeaderShimmer(ctx, outerPadding, width, frame);

  ctx.fillStyle = "#FFF9FC";
  ctx.font = "bold 42px DonutFont";
  ctx.fillText("APEX DONUT LEADERBOARD", outerPadding + 34, outerPadding + 58);

  const colX = {
    rank: outerPadding + 36,
    player: outerPadding + 150,
    donuts: width - 430,
    title: width - 300,
  };

  ctx.fillStyle = "#9B5E7C";
  ctx.font = "bold 15px DonutFont";
  ctx.fillText("RANK", colX.rank, outerPadding + headerHeight + 32);
  ctx.fillText("PLAYER", colX.player, outerPadding + headerHeight + 32);
  ctx.fillText("DONUTS", colX.donuts, outerPadding + headerHeight + 32);
  ctx.fillText("TITLE", colX.title, outerPadding + headerHeight + 32);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const bobOffset = entry.place === 1 ? Math.sin(frame * 0.7) * 9 : 0;
    const y = listTop + i * (rowHeight + rowGap) + bobOffset;
    const colors = getRankColors(entry.place);
    const cardX = outerPadding + 6;
    const cardW = width - (outerPadding + 6) * 2;

    const pulse =
      entry.place <= 3 ? 24 + (Math.sin(frame * 0.6 + i) + 1) * 11 : 14;

    ctx.save();
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = pulse;
    drawRoundedRect(ctx, cardX, y, cardW, rowHeight, 22);
    ctx.fillStyle = colors.rowBg;
    ctx.fill();
    ctx.restore();

    drawRoundedRect(ctx, cardX, y, cardW, rowHeight, 22);
    ctx.fillStyle = colors.rowBg;
    ctx.fill();

    drawRoundedRect(ctx, cardX, y, 8, rowHeight, 6);
    ctx.fillStyle = colors.accent;
    ctx.fill();

    const badgeX = colX.rank;
    const badgeY = y + 15;
    const badgeW = 72;
    const badgeH = 46;

    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 15);
    ctx.fillStyle = colors.badgeBg;
    ctx.fill();

    ctx.fillStyle = colors.badgeText;
    ctx.font = "bold 22px DonutFont";
    const rankLabel = `#${entry.place}`;
    const rankWidth = ctx.measureText(rankLabel).width;
    ctx.fillText(rankLabel, badgeX + (badgeW - rankWidth) / 2, badgeY + 30);

    const avatarSize = 46;
    const avatarX = colX.player;
    const avatarY = y + (rowHeight - avatarSize) / 2;

    if (entry.avatarImage) {
      drawCircleImage(ctx, entry.avatarImage, avatarX, avatarY, avatarSize);

      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2 + 1.5,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = "rgba(255,255,255,0.40)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "#FCE7F1";
      ctx.fill();

      ctx.fillStyle = "#8B4A69";
      ctx.font = "bold 20px DonutFont";
      const initial = entry.canvasDisplayName.slice(0, 1).toUpperCase();
      const initialWidth = ctx.measureText(initial).width;
      ctx.fillText(initial, avatarX + (avatarSize - initialWidth) / 2, avatarY + 30);
    }

    ctx.fillStyle = "#FFF9FC";
    ctx.font = "bold 24px DonutFont";
    const maxNameWidth = 430;
    const displayName = truncateText(ctx, entry.canvasDisplayName, maxNameWidth);
    ctx.fillText(displayName, avatarX + avatarSize + 18, y + 47);

    ctx.fillStyle = colors.count;
    ctx.font = "bold 28px DonutFont";
    const countText = String(entry.count);
    ctx.fillText(countText, colX.donuts, y + 48);

    ctx.fillStyle = "#FFF4F8";
    ctx.font = "23px DonutFont";
    const maxTitleWidth = 250;
    const tierText = truncateText(ctx, entry.tier, maxTitleWidth);
    ctx.fillText(tierText, colX.title, y + 46);
  }
}

async function generateLeaderboardImage(rows, guild) {
  const entries = await buildLeaderboardEntries(guild, rows);

  const width = 1280;
  const outerPadding = 28;
  const headerHeight = 96;
  const columnHeaderHeight = 44;
  const rowHeight = 76;
  const rowGap = 14;
  const listTop = outerPadding + headerHeight + 8 + columnHeaderHeight;
  const height =
    listTop +
    entries.length * rowHeight +
    (entries.length - 1) * rowGap +
    outerPadding;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawLeaderboardFrame(ctx, entries, width, height);

  return canvas.toBuffer("image/png");
}

async function generateAnimatedLeaderboardGif(rows, guild) {
  const entries = await buildLeaderboardEntries(guild, rows);

  const width = 1280;
  const outerPadding = 28;
  const headerHeight = 96;
  const columnHeaderHeight = 44;
  const rowHeight = 76;
  const rowGap = 14;
  const listTop = outerPadding + headerHeight + 8 + columnHeaderHeight;
  const height =
    listTop +
    entries.length * rowHeight +
    (entries.length - 1) * rowGap +
    outerPadding;

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(80);
  encoder.setQuality(10);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backSprinkles = createSprinkles(width, height, 140, "back");
  const frontSprinkles = createSprinkles(width, height, 210, "front");
  const bubbles = createDonutBubbles(width, height, 28);
  const sparkles = createSparkles(width, height, 38);
  const burstParticles = createBurstParticles(width, height, 95);

  const frameCount = 26;
  for (let frame = 0; frame < frameCount; frame++) {
    ctx.clearRect(0, 0, width, height);
    drawLeaderboardFrame(
      ctx,
      entries,
      width,
      height,
      backSprinkles,
      frontSprinkles,
      bubbles,
      sparkles,
      burstParticles,
      frame
    );
    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "adddonut") {
      const user = interaction.options.getUser("user");
      const displayName = await getServerDisplayName(interaction, user);
      const actorDisplayName = await getActorDisplayName(interaction);
      const amount = interaction.options.getInteger("amount") ?? 1;

      if (amount <= 0) {
        await interaction.reply("Amount must be greater than 0.");
        return;
      }

      const oldTotal = await getUserCount(user.id);
      const oldTitle = getTierTitle(oldTotal);

      const total = await addDonuts(user.id, displayName, amount);
      const rank = await getRank(user.id);
      const newTitle = getTierTitle(total);

      if (oldTitle !== newTitle) {
        await interaction.reply(
          `🍩 ${actorDisplayName} gave ${displayName} **${amount}** donut(s).\n\n` +
            buildPromotionMessage(displayName, oldTitle, newTitle, total, rank)
        );
      } else {
        await interaction.reply(
          `🍩 ${actorDisplayName} gave ${displayName} **${amount}** donut(s).\n` +
            `${displayName} now has **${total}** donut(s), is ranked **#${rank}**, and holds the title **${newTitle}**.`
        );
      }
      return;
    }

    if (interaction.commandName === "setdonut") {
      const user = interaction.options.getUser("user");
      const displayName = await getServerDisplayName(interaction, user);
      const amount = interaction.options.getInteger("amount");

      if (amount < 0) {
        await interaction.reply("Donut count cannot be negative.");
        return;
      }

      const oldTotal = await getUserCount(user.id);
      const oldTitle = getTierTitle(oldTotal);

      const total = await setDonuts(user.id, displayName, amount);
      const rank = await getRank(user.id);
      const newTitle = getTierTitle(total);

      if (oldTitle !== newTitle) {
        await interaction.reply(
          `🛠️ ${displayName}'s donut total has been updated.\n\n` +
            buildPromotionMessage(displayName, oldTitle, newTitle, total, rank)
        );
      } else {
        await interaction.reply(
          `🛠️ ${displayName}'s donut total is now **${total}**.\n` +
            `Rank: **#${rank}** | Title: **${newTitle}**`
        );
      }
      return;
    }

    if (interaction.commandName === "donutcount") {
      const user = interaction.options.getUser("user");
      const displayName = await getServerDisplayName(interaction, user);

      const total = await getUserCount(user.id);
      const rank = await getRank(user.id);
      const tier = getTierTitle(total);

      await interaction.reply(
        `📊 ${displayName} has **${total}** donut(s)` +
          `${rank ? ` and is ranked **#${rank}**` : ""}.\n` +
          `Title: **${tier}**`
      );
      return;
    }

    if (interaction.commandName === "donutleaderboard") {
      const rows = await getLeaderboard();

      if (rows.length === 0) {
        await interaction.reply("🍩 No donuts tracked yet.");
        return;
      }

      await interaction.deferReply();

      const imageBuffer = await generateLeaderboardImage(rows, interaction.guild);
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: "donut-leaderboard.png",
      });

      await interaction.editReply({
        content: "🍩 **Current standings**",
        files: [attachment],
      });
      return;
    }

    if (interaction.commandName === "donutleaderboardanimated") {
      const rows = await getLeaderboard();

      if (rows.length === 0) {
        await interaction.reply("🍩 No donuts tracked yet.");
        return;
      }

      await interaction.deferReply();

      const gifBuffer = await generateAnimatedLeaderboardGif(rows, interaction.guild);
      const attachment = new AttachmentBuilder(gifBuffer, {
        name: "donut-leaderboard-animated.gif",
      });

      await interaction.editReply({
        content: "🍩 **Animated standings**",
        files: [attachment],
      });
      return;
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp("Something broke.");
    } else {
      await interaction.reply("Something broke.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);