const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(ROOT, "data")
);
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "lunex.json");
const MAX_UPLOAD_MB = Math.max(
  1,
  Number(process.env.MAX_UPLOAD_MB || 25)
);

const OWNER_EMAIL =
  process.env.OWNER_EMAIL || "deshmukhvidyut771@gmail.com";

const OWNER_PASSWORD =
  process.env.OWNER_PASSWORD || "Zeus74474@#";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: MAX_UPLOAD_MB * 1024 * 1024,
  cors: {
    origin: true,
    credentials: true
  }
});

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(morgan("tiny"));

app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(ROOT, "public")));


/* =========================================================
   VALIDATION / HELPERS
========================================================= */

const NAME_RE = /^[A-Za-z ]+$/;
const PHONE_RE = /^\d{10}$/;

const KEY_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const cleanName = (v) =>
  String(v || "")
    .trim()
    .replace(/\s+/g, " ");

const validName = (v) =>
  NAME_RE.test(v) &&
  v.length >= 2 &&
  v.length <= 60;

const validPhone = (v) =>
  PHONE_RE.test(String(v || ""));

const validCapacity = (v) =>
  Number.isInteger(Number(v)) &&
  Number(v) >= 1 &&
  Number(v) <= 50;

const now = () =>
  new Date().toISOString();

const makeId = (prefix) =>
  prefix +
  "_" +
  crypto.randomBytes(12).toString("hex");

const roomNumber = (v) =>
  Number.isInteger(Number(v)) &&
  Number(v) >= 1 &&
  Number(v) <= 500
    ? Number(v)
    : null;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));

  return (
    x.length === y.length &&
    crypto.timingSafeEqual(x, y)
  );
};


/* =========================================================
   ROOM CREATION
========================================================= */

function makeKey() {
  let key = "";

  while (key.length < 9) {
    key +=
      KEY_CHARS[
        crypto.randomInt(KEY_CHARS.length)
      ];
  }

  return key;
}

function initialRoom(i) {
  return {
    number: i,

    booked: false,

    booking: null,

    key: null,

    capacity: 0,

    occupants: [],

    messages: [],

    audit: [],

    invite: null,

    expiresAt: null,

    library: [],

    vault: [],

    cinema: {
      url: "",
      playing: false,
      position: 0,
      updatedAt: null
    },

    arcade: {
      cells: [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],
      turn: "X"
    }
  };
}

function initialDB() {
  const rooms = {};

  for (let i = 1; i <= 500; i++) {
    rooms[i] = initialRoom(i);
  }

  return {
    version: 2,
    rooms,
    createdAt: now()
  };
}


/* =========================================================
   DATABASE
========================================================= */

let db;

try {
  db = fs.existsSync(DB_FILE)
    ? JSON.parse(
        fs.readFileSync(DB_FILE, "utf8")
      )
    : initialDB();
} catch {
  db = initialDB();
}

for (let i = 1; i <= 500; i++) {
  if (!db.rooms[i]) {
    db.rooms[i] = initialRoom(i);
  }
}


/* =========================================================
   PERSISTENCE
========================================================= */

function persist() {
  try {
    const tmp = DB_FILE + ".tmp";

    fs.writeFileSync(
      tmp,
      JSON.stringify(db)
    );

    fs.renameSync(tmp, DB_FILE);
  } catch (error) {
    console.error(
      "Persistence error:",
      error.message
    );
  }
}


/* =========================================================
   AUDIT
========================================================= */

function audit(room, type, data = {}) {
  room.audit.push({
    id: makeId("audit"),
    type,
    at: now(),
    ...data
  });

  if (room.audit.length > 2000) {
    room.audit.splice(
      0,
      room.audit.length - 2000
    );
  }
}


/* =========================================================
   PUBLIC ROOM INFORMATION
========================================================= */

function roomPublic(room) {
  return {
    number: room.number,

    status: !room.booked
      ? "available"
      : room.occupants.length >= room.capacity
      ? "full"
      : "occupied",

    booked: room.booked,

    capacity: room.capacity,

    occupants: room.occupants.length,

    expiring: !!room.expiresAt
  };
}


/* =========================================================
   REAL-TIME ROOM STATE
========================================================= */

function broadcastRoom(n) {
  io.emit(
    "room:status",
    roomPublic(db.rooms[n])
  );
}

function broadcastState(n) {
  const room = db.rooms[n];

  io.to("room:" + n).emit(
    "room:occupancy",
    {
      room: n,

      capacity: room.capacity,

      count: room.occupants.length,

      occupants: room.occupants.map(
        (occupant) => ({
          id: occupant.id,
          label: occupant.label
        })
      )
    }
  );

  broadcastRoom(n);
}


/* =========================================================
   OWNER AUTHENTICATION
========================================================= */

function ownerToken() {
  const payload = Buffer.from(
    JSON.stringify({
      exp:
        Date.now() +
        12 * 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature =
    crypto
      .createHmac(
        "sha256",
        SESSION_SECRET
      )
      .update(payload)
      .digest("base64url");

  return payload + "." + signature;
}

function verifyOwner(token) {
  try {
    const [payload, signature] =
      String(token || "").split(".");

    const expected =
      crypto
        .createHmac(
          "sha256",
          SESSION_SECRET
        )
        .update(payload)
        .digest("base64url");

    return (
      !!payload &&
      !!signature &&
      safeEqual(signature, expected) &&
      JSON.parse(
        Buffer.from(
          payload,
          "base64url"
        )
      ).exp > Date.now()
    );
  } catch {
    return false;
  }
}

function requireOwner(
  req,
  res,
  next
) {
  const token =
    req.headers.authorization?.replace(
      /^Bearer\s+/i,
      ""
    );

  if (!verifyOwner(token)) {
    return res
      .status(401)
      .json({
        error:
          "Owner authentication required."
      });
  }

  next();
}


/* =========================================================
   ROOM KEY AUTHENTICATION
========================================================= */

function roomByKey(n, key) {
  const room = db.rooms[n];

  if (
    room &&
    room.booked &&
    safeEqual(key, room.key)
  ) {
    return room;
  }

  return null;
}


/* =========================================================
   VAULT ENCRYPTION
========================================================= */

function encryptNote(text, key) {
  const encryptionKey =
    crypto
      .createHash("sha256")
      .update(
        String(key) +
          SESSION_SECRET
      )
      .digest();

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      encryptionKey,
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        String(text),
        "utf8"
      ),
      cipher.final()
    ]);

  return {
    iv: iv.toString("base64url"),

    data: encrypted.toString(
      "base64url"
    ),

    tag: cipher
      .getAuthTag()
      .toString("base64url")
  };
}

function decryptNote(note, key) {
  try {
    const encryptionKey =
      crypto
        .createHash("sha256")
        .update(
          String(key) +
            SESSION_SECRET
        )
        .digest();

    const decipher =
      crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(
          note.iv,
          "base64url"
        )
      );

    decipher.setAuthTag(
      Buffer.from(
        note.tag,
        "base64url"
      )
    );

    return Buffer.concat([
      decipher.update(
        Buffer.from(
          note.data,
          "base64url"
        )
      ),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}


/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      app: "Lunex 2.0",
      rooms: 500
    });
  }
);


/* =========================================================
   PUBLIC ROOM LIST
========================================================= */

app.get(
  "/api/rooms",
  (req, res) => {
    res.json({
      rooms: Object.values(
        db.rooms
      ).map(roomPublic)
    });
  }
);


/* =========================================================
   OWNER LOGIN
========================================================= */

app.post(
  "/api/owner/login",
  (req, res) => {
    const email =
      String(
        req.body.email || ""
      )
        .trim()
        .toLowerCase();

    const password =
      String(
        req.body.password || ""
      );

    if (
      !safeEqual(
        email,
        OWNER_EMAIL
          .trim()
          .toLowerCase()
      ) ||
      !safeEqual(
        password,
        OWNER_PASSWORD
      )
    ) {
      return res
        .status(401)
        .json({
          error:
            "Invalid owner credentials."
        });
    }

    res.json({
      token: ownerToken()
    });
  }
);


/* =========================================================
   OWNER OVERVIEW
========================================================= */

app.get(
  "/api/owner/overview",
  requireOwner,
  (req, res) => {
    const rooms =
      Object.values(db.rooms);

    const occupied =
      rooms.filter(
        (room) => room.booked
      ).length;

    const full =
      rooms.filter(
        (room) =>
          room.booked &&
          room.occupants.length >=
            room.capacity
      ).length;

    const guests =
      rooms.reduce(
        (total, room) =>
          total +
          room.occupants.length,
        0
      );

    const activity =
      rooms
        .flatMap((room) =>
          room.audit.map(
            (entry) => ({
              ...entry,
              room: room.number
            })
          )
        )
        .sort((a, b) =>
          b.at.localeCompare(a.at)
        )
        .slice(0, 150);

    res.json({
      stats: {
        total: 500,
        available:
          500 - occupied,
        occupied,
        full,
        guests
      },

      activity
    });
  }
);


/* =========================================================
   OWNER ROOM LIST
========================================================= */

app.get(
  "/api/owner/rooms",
  requireOwner,
  (req, res) => {
    res.json({
      rooms: Object.values(
        db.rooms
      ).map((room) => ({
        ...roomPublic(room),

        booking:
          room.booking,

        key:
          room.key,

        occupants:
          room.occupants.map(
            (occupant) => ({
              id: occupant.id,
              label: occupant.label,
              joinedAt:
                occupant.joinedAt
            })
          ),

        audit:
          room.audit.slice(-300)
      }))
    });
  }
);


/* =========================================================
   OWNER ROOM RESET
========================================================= */

app.post(
  "/api/rooms/:n/reset",
  requireOwner,
  (req, res) => {
    const n =
      roomNumber(
        req.params.n
      );

    if (!n) {
      return res
        .status(400)
        .json({
          error:
            "Invalid room."
        });
    }

    clearRoom(
      n,
      "The room was closed by the owner."
    );

    res.json({
      ok: true
    });
  }
);


/* =========================================================
   BOOK ROOM
   NO OTP / NO TWILIO
========================================================= */

app.post(
  "/api/rooms/:n/book",
  (req, res) => {
    const n =
      roomNumber(
        req.params.n
      );

    if (!n) {
      return res
        .status(400)
        .json({
          error:
            "Invalid room."
        });
    }

    const room =
      db.rooms[n];

    if (room.booked) {
      return res
        .status(409)
        .json({
          error:
            "This suite is no longer available."
        });
    }

    const name =
      cleanName(
        req.body.name
      );

    const phone =
      String(
        req.body.phone || ""
      ).trim();

    const capacity =
      Number(
        req.body.capacity
      );

    if (!validName(name)) {
      return res
        .status(400)
        .json({
          error:
            "Name must contain only letters and spaces."
        });
    }

    if (!validPhone(phone)) {
      return res
        .status(400)
        .json({
          error:
            "Enter a valid 10-digit mobile number."
        });
    }

    if (!validCapacity(capacity)) {
      return res
        .status(400)
        .json({
          error:
            "Capacity must be between 1 and 50."
        });
    }

    const bookingId =
      makeId("booking");

    room.booked = true;

    room.capacity =
      capacity;

    room.key =
      makeKey();

    room.booking = {
      id: bookingId,
      name,
      phone,
      capacity,
      bookedAt: now()
    };

    room.messages = [];

    room.audit = [];

    room.expiresAt =
      req.body.ttlMinutes &&
      Number(req.body.ttlMinutes) > 0
        ? new Date(
            Date.now() +
              Math.min(
                Number(
                  req.body.ttlMinutes
                ),
                1440
              ) *
                60000
          ).toISOString()
        : null;

    audit(
      room,
      "room_booked",
      {
        capacity
      }
    );

    persist();

    broadcastRoom(n);

    res.json({
      ok: true,

      room:
        roomPublic(room),

      key:
        room.key,

      bookingId,

      expiresAt:
        room.expiresAt
    });
  }
);


/* =========================================================
   CREATE INVITATION
========================================================= */

app.post(
  "/api/invite/create",
  (req, res) => {
    const n =
      roomNumber(
        req.body.roomNumber
      );

    const key =
      String(
        req.body.key || ""
      );

    const room =
      n &&
      roomByKey(
        n,
        key
      );

    if (!room) {
      return res
        .status(403)
        .json({
          error:
            "Invalid suite key."
        });
    }

    const minutes =
      Math.min(
        Math.max(
          Number(
            req.body.minutes ||
              30
          ),
          5
        ),
        240
      );

    const token =
      crypto
        .randomBytes(24)
        .toString("base64url");

    room.invite = {
      token,

      expiresAt:
        new Date(
          Date.now() +
            minutes * 60000
        ).toISOString()
    };

    persist();

    res.json({
      token,

      expiresAt:
        room.invite
          .expiresAt
    });
  }
);


/* =========================================================
   GET INVITATION
========================================================= */

app.get(
  "/api/invite/:token",
  (req, res) => {
    const room =
      Object.values(
        db.rooms
      ).find(
        (item) =>
          item.invite?.token ===
          req.params.token
      );

    if (
      !room ||
      !room.booked ||
      !room.invite ||
      new Date(
        room.invite.expiresAt
      ) <= new Date()
    ) {
      return res
        .status(404)
        .json({
          error:
            "Invitation expired or invalid."
        });
    }

    res.json({
      room:
        room.number,

      remaining:
        Math.max(
          0,
          room.capacity -
            room.occupants.length
        ),

      expiresAt:
        room.invite.expiresAt
    });
  }
);


/* =========================================================
   VAULT
========================================================= */

app.get(
  "/api/vault",
  (req, res) => {
    const n =
      roomNumber(
        req.query.room
      );

    const room =
      n &&
      roomByKey(
        n,
        req.query.key
      );

    if (!room) {
      return res
        .status(403)
        .json({
          error:
            "Unauthorized suite."
        });
    }

    res.json({
      notes: room.vault
        .map((item) => ({
          id: item.id,

          at: item.at,

          text:
            decryptNote(
              item,
              req.query.key
            )
        }))
        .filter(
          (item) =>
            item.text !== null
        )
    });
  }
);

app.post(
  "/api/vault",
  (req, res) => {
    const n =
      roomNumber(
        req.body.room
      );

    const room =
      n &&
      roomByKey(
        n,
        req.body.key
      );

    const text =
      String(
        req.body.text || ""
      ).trim();

    if (!room) {
      return res
        .status(403)
        .json({
          error:
            "Unauthorized suite."
        });
    }

    if (
      !text ||
      text.length > 10000
    ) {
      return res
        .status(400)
        .json({
          error:
            "Invalid note."
        });
    }

    const encrypted =
      encryptNote(
        text,
        req.body.key
      );

    room.vault.push({
      id: makeId("note"),
      at: now(),
      ...encrypted
    });

    if (
      room.vault.length > 100
    ) {
      room.vault.shift();
    }

    persist();

    res.json({
      ok: true
    });
  }
);


/* =========================================================
   LIBRARY
========================================================= */

app.get(
  "/api/library",
  (req, res) => {
    const n =
      roomNumber(
        req.query.room
      );

    const room =
      n &&
      roomByKey(
        n,
        req.query.key
      );

    if (!room) {
      return res
        .status(403)
        .json({
          error:
            "Unauthorized suite."
        });
    }

    res.json({
      items:
        room.library.slice(-100)
    });
  }
);

app.post(
  "/api/library",
  (req, res) => {
    const n =
      roomNumber(
        req.body.room
      );

    const room =
      n &&
      roomByKey(
        n,
        req.body.key
      );

    const url =
      String(
        req.body.url || ""
      ).trim();

    const title =
      String(
        req.body.title || ""
      )
        .trim()
        .slice(0, 160);

    if (!room) {
      return res
        .status(403)
        .json({
          error:
            "Unauthorized suite."
        });
    }

    try {
      const parsed =
        new URL(url);

      if (
        !["http:", "https:"].includes(
          parsed.protocol
        )
      ) {
        throw new Error(
          "Invalid protocol"
        );
      }
    } catch {
      return res
        .status(400)
        .json({
          error:
            "Enter a valid http(s) URL."
        });
    }

    room.library.push({
      id: makeId("link"),
      url,
      title:
        title || url,
      at: now()
    });

    if (
      room.library.length > 100
    ) {
      room.library.shift();
    }

    persist();

    res.json({
      ok: true
    });
  }
);


/* =========================================================
   FILE UPLOADS
========================================================= */

const allowedMime =
  new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/webm",
    "audio/ogg",
    "audio/mpeg",
    "audio/wav"
  ]);

const storage =
  multer.diskStorage({
    destination:
      (req, file, callback) =>
        callback(
          null,
          UPLOAD_DIR
        ),

    filename:
      (req, file, callback) =>
        callback(
          null,
          makeId("media") +
            path
              .extname(
                file.originalname ||
                  ""
              )
              .toLowerCase()
              .slice(0, 10)
        )
  });

const upload =
  multer({
    storage,

    limits: {
      fileSize:
        MAX_UPLOAD_MB *
        1024 *
        1024,

      files: 1
    },

    fileFilter:
      (req, file, callback) =>
        callback(
          null,
          allowedMime.has(
            file.mimetype
          )
        )
  });

app.post(
  "/api/upload",
  upload.single("file"),
  (req, res) => {
    const n =
      roomNumber(
        req.body.roomNumber
      );

    const room =
      n &&
      roomByKey(
        n,
        req.body.key
      );

    if (!n || !req.file) {
      return res
        .status(400)
        .json({
          error:
            "Invalid upload."
        });
    }

    if (!room) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}

      return res
        .status(403)
        .json({
          error:
            "Unauthorized suite."
        });
    }

    const type =
      req.file.mimetype.startsWith(
        "image/"
      )
        ? "image"
        : req.file.mimetype.startsWith(
            "video/"
          )
        ? "video"
        : "audio";

    const message = {
      id: makeId("msg"),

      room: n,

      senderId: null,

      senderLabel: "Guest",

      type,

      url:
        "/media/" +
        path.basename(
          req.file.path
        ),

      name:
        req.file.originalname,

      mime:
        req.file.mimetype,

      size:
        req.file.size,

      at: now(),

      edited: false
    };

    room.messages.push(
      message
    );

    audit(
      room,
      "media_sent",
      {
        type
      }
    );

    persist();

    io.to("room:" + n).emit(
      "message:new",
      message
    );

    res.json({
      message
    });
  }
);

app.use(
  "/media",
  express.static(
    UPLOAD_DIR,
    {
      maxAge: "1h"
    }
  )
);


/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
  "connection",
  (socket) => {

    /* -------------------------
       JOIN ROOM
    ------------------------- */

    socket.on(
      "room:join",
      ({
        roomNumber: roomNumberValue,
        key
      } = {}) => {

        const n =
          roomNumber(
            roomNumberValue
          );

        if (!n) {
          return socket.emit(
            "room:error",
            "Invalid suite."
          );
        }

        const room =
          db.rooms[n];

        if (
          !room.booked ||
          !safeEqual(
            String(key || ""),
            room.key
          )
        ) {
          return socket.emit(
            "room:error",
            "This suite is not booked with this key."
          );
        }

        if (
          room.occupants.some(
            (occupant) =>
              occupant.id ===
              socket.id
          )
        ) {
          return;
        }

        if (
          room.occupants.length >=
          room.capacity
        ) {
          return socket.emit(
            "room:error",
            "This suite is full."
          );
        }

        const label =
          "Guest " +
          String(
            room.occupants.length +
              1
          ).padStart(2, "0");

        const occupant = {
          id: socket.id,

          label,

          joinedAt: now()
        };

        room.occupants.push(
          occupant
        );

        socket.data.roomNumber =
          n;

        socket.data.label =
          label;

        socket.join(
          "room:" + n
        );

        const systemMessage = {
          id: makeId("sys"),

          room: n,

          senderId: null,

          senderLabel:
            "Lunex Reception",

          type: "system",

          text:
            `${label} entered the suite.`,

          at: now(),

          edited: false
        };

        room.messages.push(
          systemMessage
        );

        audit(
          room,
          "entered",
          {
            label
          }
        );

        persist();

        socket.emit(
          "room:joined",
          {
            room:
              roomPublic(room),

            occupant,

            messages:
              room.messages.slice(
                -500
              ),

            cinema:
              room.cinema,

            arcade:
              room.arcade
          }
        );

        io.to(
          "room:" + n
        ).emit(
          "message:new",
          systemMessage
        );

        broadcastState(n);
      }
    );


    /* -------------------------
       SEND MESSAGE
    ------------------------- */

    socket.on(
      "message:send",
      ({ text } = {}) => {

        const n =
          socket.data.roomNumber;

        const room =
          n && db.rooms[n];

        const value =
          String(text || "")
            .trim();

        if (
          !room ||
          !value ||
          value.length > 4000
        ) {
          return;
        }

        const recent =
          room.messages.filter(
            (message) =>
              message.senderId ===
                socket.id &&
              Date.now() -
                Date.parse(
                  message.at
                ) <
                3000
          );

        if (
          recent.length >= 8
        ) {
          return socket.emit(
            "room:error",
            "Please slow down."
          );
        }

        const message = {
          id: makeId("msg"),

          room: n,

          senderId:
            socket.id,

          senderLabel:
            socket.data.label,

          type: "text",

          text: value,

          at: now(),

          edited: false
        };

        room.messages.push(
          message
        );

        audit(
          room,
          "message_sent",
          {
            messageId:
              message.id,

            senderLabel:
              socket.data.label
          }
        );

        persist();

        io.to(
          "room:" + n
        ).emit(
          "message:new",
          message
        );
      }
    );


    /* -------------------------
       EDIT MESSAGE
    ------------------------- */

    socket.on(
      "message:edit",
      ({ id, text } = {}) => {

        const n =
          socket.data.roomNumber;

        const room =
          n && db.rooms[n];

        const message =
          room?.messages.find(
            (item) =>
              item.id === id
          );

        const value =
          String(text || "")
            .trim();

        if (
          !message ||
          message.senderId !==
            socket.id ||
          message.type !==
            "text" ||
          !value ||
          value.length > 4000
        ) {
          return;
        }

        message.text =
          value;

        message.edited =
          true;

        message.editedAt =
          now();

        audit(
          room,
          "message_edited",
          {
            messageId: id,

            senderLabel:
              socket.data.label
          }
        );

        persist();

        io.to(
          "room:" + n
        ).emit(
          "message:updated",
          message
        );
      }
    );


    /* -------------------------
       DELETE MESSAGE
    ------------------------- */

    socket.on(
      "message:delete",
      ({ id } = {}) => {

        const n =
          socket.data.roomNumber;

        const room =
          n && db.rooms[n];

        const message =
          room?.messages.find(
            (item) =>
              item.id === id
          );

        if (
          !message ||
          message.senderId !==
            socket.id
        ) {
          return;
        }

        message.deleted =
          true;

        delete message.text;
        delete message.url;
        delete message.name;

        persist();

        io.to(
          "room:" + n
        ).emit(
          "message:updated",
          message
        );
      }
    );


    /* -------------------------
       CINEMA SYNC
    ------------------------- */

    socket.on(
      "cinema:sync",
      ({
        url,
        playing,
        position
      } = {}) => {

        const n =
          socket.data.roomNumber;

        const room =
          n && db.rooms[n];

        if (!room) {
          return;
        }

        if (
          typeof url ===
            "string" &&
          url.length <= 1500
        ) {
          room.cinema.url =
            url;
        }

        room.cinema.playing =
          !!playing;

        room.cinema.position =
          Math.max(
            0,
            Number(position) || 0
          );

        room.cinema.updatedAt =
          now();

        persist();

        io.to(
          "room:" + n
        ).emit(
          "cinema:state",
          room.cinema
        );
      }
    );


    /* -------------------------
       TIC TAC TOE MOVE
    ------------------------- */

    socket.on(
      "arcade:move",
      ({
        index,
        value
      } = {}) => {

        const n =
          socket.data.roomNumber;

        const room =
          n && db.rooms[n];

        if (
          !room ||
          !Number.isInteger(
            index
          ) ||
          index < 0 ||
          index > 8 ||
          !["X", "O"].includes(
            value
          ) ||
          room.arcade.cells[
            index
          ]
        ) {
          return;
        }

        if (
          value !==
          room.arcade.turn
        ) {
          return;
        }

        room.arcade.cells[
          index
        ] = value;

        room.arcade.turn =
          value === "X"
            ? "O"
            : "X";

        persist();

        io.to(
          "room:" + n
        ).emit(
          "arcade:state",
          room.arcade
        );
      }
    );


    /* -------------------------
       RESET TIC TAC TOE
    ------------------------- */

    socket.on(
      "arcade:reset",
      () => {

        const n =
          socket.data.roomNumber;

        const room =
          n && db.rooms[n];

        if (!room) {
          return;
        }

        room.arcade = {
          cells: [
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
          ],

          turn: "X"
        };

        persist();

        io.to(
          "room:" + n
        ).emit(
          "arcade:state",
          room.arcade
        );
      }
    );


    /* -------------------------
       EXIT ROOM
    ------------------------- */

    socket.on(
      "room:exit",
      () => leave("exit")
    );


    /* -------------------------
       DISCONNECT
    ------------------------- */

    socket.on(
      "disconnect",
      (reason) =>
        leave(
          reason ||
            "disconnect"
        )
    );


    /* -------------------------
       LEAVE FUNCTION
    ------------------------- */

    function leave(reason) {

      const n =
        socket.data.roomNumber;

      const room =
        n && db.rooms[n];

      if (!room) {
        return;
      }

      const index =
        room.occupants.findIndex(
          (occupant) =>
            occupant.id ===
            socket.id
        );

      if (index < 0) {
        return;
      }

      const person =
        room.occupants[index];

      room.occupants.splice(
        index,
        1
      );

      const systemMessage = {
        id: makeId("sys"),

        room: n,

        senderId: null,

        senderLabel:
          "Lunex Reception",

        type: "system",

        text:
          `${person.label} left the chat.`,

        at: now(),

        edited: false
      };

      room.messages.push(
        systemMessage
      );

      audit(
        room,
        "exited",
        {
          label:
            person.label,

          reason
        }
      );

      socket.data.roomNumber =
        null;

      if (
        room.occupants.length ===
        0
      ) {

        clearRoom(
          n,
          "The last guest left."
        );

      } else {

        persist();

        io.to(
          "room:" + n
        ).emit(
          "message:new",
          systemMessage
        );

        broadcastState(n);
      }
    }
  }
);


/* =========================================================
   CLEAR ROOM
========================================================= */

function clearRoom(
  n,
  reason
) {
  const room =
    db.rooms[n];

  if (!room) {
    return;
  }

  room.booked = false;

  room.booking = null;

  room.key = null;

  room.capacity = 0;

  room.occupants = [];

  room.messages = [];

  room.audit = [];

  room.invite = null;

  room.expiresAt = null;

  room.library = [];

  room.vault = [];

  room.cinema = {
    url: "",
    playing: false,
    position: 0,
    updatedAt: null
  };

  room.arcade = {
    cells: [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ],
    turn: "X"
  };

  persist();

  io.to(
    "room:" + n
  ).emit(
    "room:cleared",
    {
      room: n,
      reason
    }
  );

  broadcastRoom(n);
}


/* =========================================================
   AUTOMATIC ROOM EXPIRATION
========================================================= */

setInterval(
  () => {
    const currentTime =
      Date.now();

    for (
      let i = 1;
      i <= 500;
      i++
    ) {
      const room =
        db.rooms[i];

      if (
        room.booked &&
        room.expiresAt &&
        new Date(
          room.expiresAt
        ).getTime() <=
          currentTime
      ) {
        clearRoom(
          i,
          "Suite lifetime expired."
        );
      }
    }
  },
  30000
);


/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.get(
  "*",
  (req, res) => {
    res.sendFile(
      path.join(
        ROOT,
        "public",
        "index.html"
      )
    );
  }
);


/* =========================================================
   START SERVER
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `LUNEX 2.0 running on port ${PORT}`
    );
  }
);