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
  removeUser,
  cleanupUsers,
  replaceUserHistoryFromScan,
  getUserHistory,
  getUserCount,
  getRank,
  getLeaderboard,
  getAllUsers,
  getTierTitle,
} = require("./db");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
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

function formatUserList(users, limit = 8) {
  if (users.length === 0) return "Nobody matched.";

  const shown = users
    .slice(0, limit)
    .map((user) => `• ${user.username} — ${user.count} donut(s)`)
    .join("\n");

  if (users.length <= limit) return shown;
  return `${shown}\n…and ${users.length - limit} more.`;
}

function getFlexMessage(displayName, total, rank, tier) {
  const lines = [
    "✨🍩 **DONUT FLEX DETECTED** 🍩✨",
    `**${displayName}** just stepped onto the pastry stage.`,
    `Donuts: **${total}** | Rank: **${rank ? `#${rank}` : "Unranked"}**`,
    `Title: **${tier}**`,
  ];

  if (total === 0) {
    lines.push("Status: flour on the apron, zero glaze in the vault.");
  } else if (rank === 1) {
    lines.push("Status: wearing the frosting crown like it was custom made.");
  } else if (rank && rank <= 3) {
    lines.push("Status: podium energy, sprinkle pressure rising.");
  } else if (total >= 50) {
    lines.push("Status: certified bakery menace.");
  } else {
    lines.push("Status: respectable glaze levels, room for chaos.");
  }

  return lines.join("\n");
}

const TIER_LIMITS = [
  { max: 0, title: "Gluten Free" },
  { max: 5, title: "Donut Rookie" },
  { max: 10, title: "Donut Boy/Girl" },
  { max: 15, title: "Donut Man/Woman" },
  { max: 20, title: "Donut Enjoyer" },
  { max: 25, title: "Donut Specialist" },
  { max: 30, title: "Glazed Apprentice" },
  { max: 35, title: "Frosted Warrior" },
  { max: 40, title: "Sprinkle Soldier" },
  { max: 45, title: "Jelly-Filled Threat" },
  { max: 50, title: "Deep Fried Veteran" },
  { max: 55, title: "Donut Master" },
  { max: 60, title: "Grand Glazer" },
  { max: 65, title: "Supreme Sprinkle Lord" },
  { max: 70, title: "Hole Commander" },
  { max: 80, title: "Bakery General" },
  { max: 90, title: "Mythical Donut Entity" },
  { max: 100, title: "Ascended Pastry Being" },
  { max: 110, title: "Glucose Overlord" },
  { max: 120, title: "Celestial Pastry" },
  { max: 130, title: "Donut Demigod" },
];

function getNextTierProgress(count) {
  const previousLimit = TIER_LIMITS.findLast((tier) => count > tier.max)?.max ?? 0;
  const nextTier = TIER_LIMITS.find((tier) => count < tier.max);

  if (!nextTier) {
    return {
      label: "Max glaze achieved",
      ratio: 1,
      remaining: 0,
    };
  }

  const span = Math.max(1, nextTier.max - previousLimit);
  const progress = Math.max(0, count - previousLimit);

  return {
    label: `Next: ${nextTier.title}`,
    ratio: Math.min(1, progress / span),
    remaining: nextTier.max - count,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMessageText(value) {
  return value
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeUserAliases(user, displayName) {
  return [
    `<@${user.id}>`,
    `<@!${user.id}>`,
    displayName,
    user.globalName,
    user.username,
  ]
    .filter(Boolean)
    .map((alias) => normalizeMessageText(alias))
    .filter((alias, index, aliases) => alias.length >= 2 && aliases.indexOf(alias) === index);
}

function getMessageSearchText(message) {
  const embedText = message.embeds
    .flatMap((embed) => [
      embed.title,
      embed.description,
      embed.footer?.text,
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ])
    .filter(Boolean)
    .join(" ");

  return normalizeMessageText(`${message.content ?? ""} ${embedText}`);
}

function parseDonutEventFromText(text, aliases) {
  if (!text) return null;

  const lowerText = text.toLowerCase();
  const mentionedAlias = aliases.find((alias) => lowerText.includes(alias.toLowerCase()));
  if (!mentionedAlias) return null;

  const aliasPattern = escapeRegex(mentionedAlias);
  const totalPatterns = [
    new RegExp(
      `${aliasPattern}.{0,180}(?:now has|has|currently has|donut total(?: is)? now|total(?: is)? now|new total:?|updated to|set to|is now at|stands at)\\D{0,32}(\\d{1,6})(?:\\s+donut)?`,
      "i"
    ),
    new RegExp(
      `(?:now has|has|currently has|donut total(?: is)? now|total(?: is)? now|new total:?|updated to|set to|is now at|stands at)\\D{0,32}(\\d{1,6})(?:\\s+donut)?.{0,180}${aliasPattern}`,
      "i"
    ),
    new RegExp(`${aliasPattern}\\D{0,24}(\\d{1,6})\\s*(?:donut|🍩)`, "i"),
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const count = Number.parseInt(match[1], 10);
    if (Number.isFinite(count) && count >= 0) {
      return {
        type: "total",
        value: count,
      };
    }
  }

  const deltaPatterns = [
    new RegExp(`${aliasPattern}.{0,120}(?:gave|gets?|earned|receives?|awarded|added)\\D{0,20}(\\d{1,3})(?:\\s+donut|🍩)`, "i"),
    new RegExp(`(?:gave|gets?|earned|receives?|awarded|added)\\D{0,20}(\\d{1,3})(?:\\s+donut|🍩).{0,120}${aliasPattern}`, "i"),
    new RegExp(`${aliasPattern}.{0,40}\\+(\\d{1,3})\\s*(?:donut|🍩)`, "i"),
  ];

  for (const pattern of deltaPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const amount = Number.parseInt(match[1], 10);
    if (Number.isFinite(amount) && amount > 0) {
      return {
        type: "delta",
        value: amount,
      };
    }
  }

  return null;
}

function parseDonutEventFromMessage(message, aliases) {
  return parseDonutEventFromText(getMessageSearchText(message), aliases);
}

async function fetchChannelMessages(channel, limit = null) {
  const messages = [];
  let before;

  while (limit === null || messages.length < limit) {
    const batchSize = limit === null ? 100 : Math.min(100, limit - messages.length);
    const batch = await channel.messages.fetch({
      limit: batchSize,
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    messages.push(...batch.values());
    before = batch.last().id;
  }

  return messages;
}

function buildTrendFromScanEvents(events, currentTotal) {
  const sortedEvents = [...events].sort((a, b) => new Date(a.at) - new Date(b.at));
  const rawPoints = [];
  let estimatedCount = null;

  for (const event of sortedEvents) {
    if (event.type === "total") {
      estimatedCount = event.value;
    } else if (event.type === "delta") {
      estimatedCount = (estimatedCount ?? 0) + event.value;
    }

    if (estimatedCount !== null) {
      rawPoints.push({
        at: event.at,
        count: estimatedCount,
        source: "history-scan",
      });
    }
  }

  if (rawPoints.length === 0) {
    return {
      points: [],
      rawCount: 0,
      outlierCount: 0,
    };
  }

  const maxReasonable = Math.max(50, currentTotal + 25, Math.ceil(currentTotal * 1.75));
  const cappedPoints = rawPoints.filter((point) => point.count <= maxReasonable);
  const outliers = rawPoints.length - cappedPoints.length;
  const cleaned = [];

  for (let i = 0; i < cappedPoints.length; i++) {
    const point = cappedPoints[i];
    const prev = cleaned[cleaned.length - 1] ?? null;
    const next = cappedPoints[i + 1] ?? null;

    if (prev && next) {
      const neighborsAgree = Math.abs(prev.count - next.count) <= Math.max(8, currentTotal * 0.12);
      const spikeThreshold = Math.max(15, currentTotal * 0.35);
      const isSpike =
        neighborsAgree &&
        Math.abs(point.count - prev.count) >= spikeThreshold &&
        Math.abs(point.count - next.count) >= spikeThreshold;

      if (isSpike) continue;
    }

    if (prev && point.count < prev.count) {
      const allowedDip = Math.max(3, Math.ceil(prev.count * 0.12));
      if (prev.count - point.count > allowedDip) continue;
    }

    cleaned.push(point);
  }

  const byDay = new Map();
  for (const point of cleaned) {
    const day = point.at.slice(0, 10);
    const existing = byDay.get(day);
    if (!existing || new Date(point.at) > new Date(existing.at)) {
      byDay.set(day, point);
    }
  }

  const points = [...byDay.values()].sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    points,
    rawCount: rawPoints.length,
    outlierCount: outliers + cappedPoints.length - cleaned.length,
  };
}

async function scanDonutHistory(channel, user, displayName, limit, currentTotal) {
  const aliases = makeUserAliases(user, displayName);
  const messages = await fetchChannelMessages(channel, limit);
  const events = [];

  for (const message of messages) {
    const event = parseDonutEventFromMessage(message, aliases);
    if (!event) continue;

    events.push({
      at: message.createdAt.toISOString(),
      ...event,
    });
  }

  return {
    scannedCount: messages.length,
    eventCount: events.length,
    ...buildTrendFromScanEvents(events, currentTotal),
  };
}

function calculateDonutRate(history) {
  if (history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const days = (new Date(last.at) - new Date(first.at)) / 86400000;
  const gained = last.count - first.count;

  if (days <= 0) return null;

  return {
    gained,
    days,
    perDay: gained / days,
    perWeek: (gained / days) * 7,
  };
}

function formatDonutRate(rate) {
  if (!rate) return "Not enough history yet";
  return `${rate.perWeek.toFixed(2)} / week`;
}

function getRankSystemText() {
  return [
    "🍩 **DONUT RANKING SYSTEM** 🍩",
    "",
    "**0** — Gluten Free",
    "**1 - 5** — Donut Rookie",
    "**6 - 10** — Donut Boy/Girl",
    "**11 - 15** — Donut Man/Woman",
    "**16 - 20** — Donut Enjoyer",
    "**21 - 25** — Donut Specialist",
    "**26 - 30** — Glazed Apprentice",
    "**31 - 35** — Frosted Warrior",
    "**36 - 40** — Sprinkle Soldier",
    "**41 - 45** — Jelly-Filled Threat",
    "**46 - 50** — Deep Fried Veteran",
    "**51 - 55** — Donut Master",
    "**56 - 60** — Grand Glazer",
    "**61 - 65** — Supreme Sprinkle Lord",
    "**66 - 70** — Hole Commander",
    "**71 - 80** — Bakery General",
    "**81 - 90** — Mythical Donut Entity",
    "**91 - 100** — Ascended Pastry Being",
    "**101 - 110** — Glucose Overlord",
    "**111 - 120** — Celestial Pastry",
    "**121 - 130** — Donut Demigod",
    "**131+** — The Chosen Donut",
  ].join("\n");
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

function drawTextFit(ctx, text, x, y, maxWidth, font, color, minSize = 18) {
  const match = font.match(/^(.+?)(\d+)px(.+)$/);
  if (!match) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(truncateText(ctx, text, maxWidth), x, y);
    return;
  }

  const [, prefix, sizeText, suffix] = match;
  let size = Number.parseInt(sizeText, 10);

  while (size > minSize) {
    ctx.font = `${prefix}${size}px${suffix}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  ctx.fillStyle = color;
  ctx.fillText(truncateText(ctx, text, maxWidth), x, y);
}

function drawProfileStat(ctx, label, value, x, y, width, height = 92) {
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = "rgba(255, 249, 252, 0.76)";
  ctx.fill();

  ctx.fillStyle = "#9B5E7C";
  ctx.font = "bold 16px DonutFont";
  ctx.fillText(label, x + 18, y + 28);

  drawTextFit(
    ctx,
    value,
    x + 18,
    y + height - 26,
    width - 36,
    "bold 30px DonutFont",
    "#7A2F57",
    20
  );
}

function drawProfileGraph(ctx, history, x, y, width, height) {
  drawRoundedRect(ctx, x, y, width, height, 24);
  ctx.fillStyle = "rgba(255, 249, 252, 0.78)";
  ctx.fill();

  drawTextFit(
    ctx,
    "DONUT MOMENTUM",
    x + 26,
    y + 42,
    width - 52,
    "bold 24px DonutFont",
    "#7A2F57",
    18
  );

  const graphX = x + 58;
  const graphY = y + 76;
  const graphW = width - 108;
  const graphH = height - 136;

  ctx.strokeStyle = "rgba(122, 47, 87, 0.16)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const gy = graphY + (graphH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(graphX, gy);
    ctx.lineTo(graphX + graphW, gy);
    ctx.stroke();
  }

  if (history.length === 0) {
    drawTextFit(
      ctx,
      "No history scanned yet",
      graphX + 24,
      graphY + graphH / 2,
      graphW - 48,
      "bold 22px DonutFont",
      "#9B5E7C",
      16
    );
    return;
  }

  const counts = history.map((point) => point.count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const countSpan = Math.max(1, maxCount - minCount);
  const firstTime = new Date(history[0].at).getTime();
  const lastTime = new Date(history[history.length - 1].at).getTime();
  const timeSpan = Math.max(1, lastTime - firstTime);

  const points = history.map((point) => {
    const t = new Date(point.at).getTime();
    return {
      x: graphX + ((t - firstTime) / timeSpan) * graphW,
      y: graphY + graphH - ((point.count - minCount) / countSpan) * graphH,
      count: point.count,
    };
  });

  ctx.strokeStyle = "#FFD166";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i].x, points[i].y);
    else ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#E84D93";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i].x, points[i].y);
    else ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF9FC";
    ctx.fill();
    ctx.strokeStyle = "#E84D93";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.fillStyle = "#9B5E7C";
  ctx.font = "bold 15px DonutFont";
  ctx.fillText(String(maxCount), x + 24, graphY + 6);
  ctx.fillText(String(minCount), x + 24, graphY + graphH);

  const startDate = new Date(history[0].at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endDate = new Date(history[history.length - 1].at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  ctx.fillText(startDate, graphX, y + height - 24);
  ctx.fillText(endDate, graphX + graphW - ctx.measureText(endDate).width, y + height - 24);
}

async function generateDonutProfileImage(user, displayName, total, rank, tier, history) {
  const width = 1400;
  const height = 780;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backSprinkles = createSprinkles(width, height, 110, "back");
  const frontSprinkles = createSprinkles(width, height, 130, "front");
  const bubbles = createDonutBubbles(width, height, 22);
  const sparkles = createSparkles(width, height, 28);
  drawBackground(ctx, width, height, backSprinkles, frontSprinkles, bubbles, sparkles, null, 4);

  drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 34);
  ctx.fillStyle = "rgba(255, 244, 248, 0.74)";
  ctx.fill();

  const avatarUrl = user.displayAvatarURL({
    extension: "png",
    size: 256,
    forceStatic: true,
  });

  let avatarImage = null;
  try {
    avatarImage = await loadImage(avatarUrl);
  } catch {
    avatarImage = null;
  }

  const leftX = 84;
  const leftW = 800;
  const rightX = 920;
  const rightW = 396;
  const avatarX = leftX;
  const avatarY = 86;
  const avatarSize = 152;

  if (avatarImage) {
    drawCircleImage(ctx, avatarImage, avatarX, avatarY, avatarSize);
  } else {
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#FCE7F1";
    ctx.fill();

    ctx.fillStyle = "#8B4A69";
    ctx.font = "bold 56px DonutFont";
    const initial = sanitizeDisplayNameForCanvas(displayName).slice(0, 1).toUpperCase();
    const initialWidth = ctx.measureText(initial).width;
    ctx.fillText(
      initial,
      avatarX + (avatarSize - initialWidth) / 2,
      avatarY + avatarSize / 2 + 20
    );
  }

  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = "#FFD166";
  ctx.lineWidth = 8;
  ctx.stroke();

  const titleX = avatarX + avatarSize + 34;
  drawTextFit(
    ctx,
    sanitizeDisplayNameForCanvas(displayName),
    titleX,
    128,
    leftX + leftW - titleX,
    "bold 54px DonutFont",
    "#7A2F57",
    30
  );

  drawTextFit(
    ctx,
    tier,
    titleX,
    170,
    leftX + leftW - titleX,
    "bold 25px DonutFont",
    "#9B5E7C",
    18
  );

  drawRoundedRect(ctx, titleX, 194, 372, 82, 22);
  ctx.fillStyle = "rgba(255, 249, 252, 0.82)";
  ctx.fill();

  drawTextFit(ctx, `${total}`, titleX + 24, 252, 150, "bold 66px DonutFont", "#E84D93", 36);
  ctx.fillStyle = "#7A2F57";
  ctx.font = "bold 24px DonutFont";
  ctx.fillText("donuts banked", titleX + 190, 244);

  const rate = calculateDonutRate(history);
  drawProfileStat(ctx, "RANK", rank ? `#${rank}` : "Unranked", leftX, 322, 206);
  drawProfileStat(ctx, "RATE", formatDonutRate(rate), leftX + 230, 322, 274);
  drawProfileStat(ctx, "HISTORY", `${history.length} points`, leftX + 528, 322, 252);

  const progress = getNextTierProgress(total);
  drawRoundedRect(ctx, leftX, 452, leftW, 132, 22);
  ctx.fillStyle = "rgba(255, 249, 252, 0.76)";
  ctx.fill();
  ctx.fillStyle = "#9B5E7C";
  ctx.font = "bold 17px DonutFont";
  ctx.fillText(progress.label, leftX + 26, 490);
  drawTextFit(
    ctx,
    progress.remaining === 0 ? "Legendary pastry orbit" : `${progress.remaining} donut(s) away`,
    leftX + 26,
    530,
    leftW - 52,
    "bold 28px DonutFont",
    "#7A2F57",
    20
  );

  drawRoundedRect(ctx, leftX + 26, 548, leftW - 52, 20, 10);
  ctx.fillStyle = "rgba(122, 47, 87, 0.14)";
  ctx.fill();
  drawRoundedRect(ctx, leftX + 26, 548, (leftW - 52) * progress.ratio, 20, 10);
  ctx.fillStyle = "#FFD166";
  ctx.fill();

  drawProfileGraph(ctx, history, rightX, 86, rightW, 498);

  const footer = rate
    ? `Scanned span: ${rate.days.toFixed(1)} days | Net gain: ${rate.gained}`
    : "Run /donuthistoryscan to build a real timeline from old channel messages";
  drawRoundedRect(ctx, leftX, 622, width - 168, 76, 20);
  ctx.fillStyle = "rgba(255, 249, 252, 0.66)";
  ctx.fill();
  drawTextFit(ctx, footer, leftX + 26, 668, width - 220, "bold 22px DonutFont", "#9B5E7C", 16);

  return canvas.toBuffer("image/png");
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

    if (interaction.commandName === "removedonutuser") {
      const user = interaction.options.getUser("user");
      const displayName = await getServerDisplayName(interaction, user);
      const removed = await removeUser(user.id);

      if (!removed) {
        await interaction.reply({
          content: `🍩 ${displayName} was not being tracked.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply(
        `🧹 Removed **${displayName}** from donut tracking.\n` +
          `They had **${removed.count}** donut(s) and the title **${getTierTitle(removed.count)}**.`
      );
      return;
    }

    if (interaction.commandName === "donutcleanup") {
      const target = interaction.options.getString("target");
      const run = interaction.options.getBoolean("run") ?? false;
      let matched = [];
      let label = "";

      if (target === "zero") {
        label = "zero-count users";
        matched = await cleanupUsers((user) => user.count <= 0, run);
      } else if (target === "missing") {
        label = "users no longer in this server";
        await interaction.deferReply({ ephemeral: !run });

        const trackedUsers = await getAllUsers();
        const missingIds = new Set();

        for (const trackedUser of trackedUsers) {
          try {
            await interaction.guild.members.fetch(trackedUser.user_id);
          } catch (err) {
            if (err.code === 10007 || err.status === 404) {
              missingIds.add(trackedUser.user_id);
            } else {
              throw err;
            }
          }
        }

        matched = await cleanupUsers((user) => missingIds.has(user.user_id), run);

        await interaction.editReply(
          `🧹 **Cleanup ${run ? "complete" : "preview"}:** ${label}\n` +
            `Matched: **${matched.length}**\n` +
            `${run ? "Removed" : "Would remove"}:\n${formatUserList(matched)}\n\n` +
            `${run ? "" : "Run again with `run: True` to remove them."}`
        );
        return;
      } else {
        await interaction.reply({
          content: "Unknown cleanup target.",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content:
          `🧹 **Cleanup ${run ? "complete" : "preview"}:** ${label}\n` +
          `Matched: **${matched.length}**\n` +
          `${run ? "Removed" : "Would remove"}:\n${formatUserList(matched)}\n\n` +
          `${run ? "" : "Run again with `run: True` to remove them."}`,
        ephemeral: !run,
      });
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

    if (interaction.commandName === "donutflex") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const displayName = await getServerDisplayName(interaction, user);

      const total = await getUserCount(user.id);
      const rank = await getRank(user.id);
      const tier = getTierTitle(total);

      await interaction.reply(getFlexMessage(displayName, total, rank, tier));
      return;
    }

    if (interaction.commandName === "donuthistoryscan") {
      const channel = interaction.options.getChannel("channel");
      const user = interaction.options.getUser("user");
      const limit = interaction.options.getInteger("limit") ?? null;
      const displayName = await getServerDisplayName(interaction, user);

      if (!channel?.messages?.fetch) {
        await interaction.reply({
          content: "That channel does not expose message history to this bot.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      const currentTotal = await getUserCount(user.id);
      const scan = await scanDonutHistory(channel, user, displayName, limit, currentTotal);
      const history = await replaceUserHistoryFromScan(user.id, scan.points);

      const preview = scan.points
        .slice(-5)
        .map((point) => {
          const date = new Date(point.at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `• ${date}: ${point.count}`;
        })
        .join("\n");

      await interaction.editReply(
        `📈 Scanned **${scan.scannedCount}** message(s) in ${channel} for **${displayName}**.\n` +
          `Matched **${scan.eventCount}** donut-ish update(s), built **${scan.points.length}** trend point(s), filtered **${scan.outlierCount}** noisy point(s).\n` +
          `Stored timeline now has **${history.length}** point(s).\n` +
          `${preview ? `\nLatest trend points:\n${preview}` : "\nNo usable trend points found. Try a channel with the old donut messages."}`
      );
      return;
    }

    if (interaction.commandName === "donutprofile") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const displayName = await getServerDisplayName(interaction, user);

      await interaction.deferReply();

      const total = await getUserCount(user.id);
      const rank = await getRank(user.id);
      const tier = getTierTitle(total);
      const storedHistory = await getUserHistory(user.id);
      const history = [...storedHistory];

      if (
        history.length === 0 ||
        history[history.length - 1].count !== total
      ) {
        history.push({
          at: new Date().toISOString(),
          count: total,
          source: "current",
        });
      }

      const imageBuffer = await generateDonutProfileImage(
        user,
        displayName,
        total,
        rank,
        tier,
        history
      );
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: "donut-profile.png",
      });

      await interaction.editReply({
        content: `🍩 **${displayName}'s donut profile**`,
        files: [attachment],
      });
      return;
    }

    if (interaction.commandName === "donutranks") {
      await interaction.reply(getRankSystemText());
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
