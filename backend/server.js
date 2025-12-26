const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const cors = require('cors');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 5000;

const mongoUrl = process.env.MONGO_URI || '';

if (!mongoUrl) {
  console.log('MONGO_URL is empty, set it before running the server');
}

mongoose.set('strictQuery', true);
if (mongoUrl) {
  mongoose
    .connect(mongoUrl)
    .then(function () {
      console.log('Mongo connected');
    })
    .catch(function (err) {
      console.log('Mongo error', err.message || err);
    });
}

const auditSchema = new mongoose.Schema({
  pdfId: String,
  originalHash: String,
  signedHash: String,
  signedAt: Date
});

const Audit = mongoose.model('AuditLog', auditSchema);

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
const signedDir = path.join(__dirname, 'signed');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true });

app.use('/uploads', express.static(uploadsDir));
app.use('/signed', express.static(signedDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const name = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, name);
  }
});

const upload = multer({ storage: storage });

app.post('/upload-pdf', upload.single('file'), function (req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const pdfId = req.file.filename;
    const url = '/uploads/' + pdfId;
    res.json({ pdfId: pdfId, url: url });
  } catch (err) {
    console.log('upload error', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/sign-pdf', async function (req, res) {
  try {
    const body = req.body || {};
    const pdfId = body.pdfId;
    const base64Signature = body.base64Signature || '';
    const fields = Array.isArray(body.fields) ? body.fields : [];

    if (!pdfId) {
      return res.status(400).json({ error: 'pdfId is required' });
    }

    const originalPath = path.join(uploadsDir, pdfId);
    if (!fs.existsSync(originalPath)) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const originalBytes = fs.readFileSync(originalPath);
    const originalHash = crypto.createHash('sha256').update(originalBytes).digest('hex');

    const pdfDoc = await PDFDocument.load(originalBytes);

    let signatureImage = null;
    if (base64Signature) {
      let base64DataFull = base64Signature;
      const isJpg = base64DataFull.indexOf('image/jpeg') !== -1 || base64DataFull.indexOf('image/jpg') !== -1;
      let base64Data = base64DataFull;
      const commaIndex = base64Data.indexOf(',');
      if (commaIndex !== -1) {
        base64Data = base64Data.slice(commaIndex + 1);
      }
      const imgBytes = Buffer.from(base64Data, 'base64');
      if (isJpg) {
        signatureImage = await pdfDoc.embedJpg(imgBytes);
      } else {
        signatureImage = await pdfDoc.embedPng(imgBytes);
      }
    }

    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const pageIndex = typeof f.page === 'number' ? f.page : 0;
      const page = pages[pageIndex] || pages[0];
      const size = page.getSize();
      const pw = size.width;
      const ph = size.height;

      const xPercent = Number(f.xPercent) || 0;
      const yPercent = Number(f.yPercent) || 0;
      const wPercent = Number(f.widthPercent) || 0;
      const hPercent = Number(f.heightPercent) || 0;

      const boxWidth = (wPercent / 100) * pw;
      const boxHeight = (hPercent / 100) * ph;
      const boxX = (xPercent / 100) * pw;
      const topY = (yPercent / 100) * ph;
      const boxY = ph - topY - boxHeight;

      if (!boxWidth || !boxHeight) continue;

      if (f.type === 'signature' && signatureImage) {
        const imgW = signatureImage.width;
        const imgH = signatureImage.height;
        let drawW = boxWidth;
        let drawH = (imgH / imgW) * drawW;
        if (drawH > boxHeight) {
          drawH = boxHeight;
          drawW = (imgW / imgH) * drawH;
        }
        const drawX = boxX + (boxWidth - drawW) / 2;
        const drawY = boxY + (boxHeight - drawH) / 2;
        page.drawImage(signatureImage, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH
        });
      } else if (f.type === 'image') {
        let img = null;
        if (f.imageData && typeof f.imageData === 'string') {
          let base64DataFull2 = f.imageData;
          const isJpg2 = base64DataFull2.indexOf('image/jpeg') !== -1 || base64DataFull2.indexOf('image/jpg') !== -1;
          let base64Data2 = base64DataFull2;
          const commaIndex2 = base64Data2.indexOf(',');
          if (commaIndex2 !== -1) {
            base64Data2 = base64Data2.slice(commaIndex2 + 1);
          }
          const imgBytes2 = Buffer.from(base64Data2, 'base64');
          if (isJpg2) {
            img = await pdfDoc.embedJpg(imgBytes2);
          } else {
            img = await pdfDoc.embedPng(imgBytes2);
          }
        } else if (signatureImage) {
          img = signatureImage;
        }
        if (img) {
          const imgW = img.width;
          const imgH = img.height;
          let drawW = boxWidth;
          let drawH = (imgH / imgW) * drawW;
          if (drawH > boxHeight) {
            drawH = boxHeight;
            drawW = (imgW / imgH) * drawH;
          }
          const drawX = boxX + (boxWidth - drawW) / 2;
          const drawY = boxY + (boxHeight - drawH) / 2;
          page.drawImage(img, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH
          });
        }
      } else if (f.type === 'text' || f.type === 'date') {
        let text = '';
        if (f.type === 'date') {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          text = year + '-' + month + '-' + day;
        } else {
          text = typeof f.value === 'string' && f.value.trim() ? f.value : 'Text';
        }
        const fontSize = 10;
        const textX = boxX + 2;
        const textY = boxY + boxHeight / 2 - fontSize / 2;
        page.drawText(text, {
          x: textX,
          y: textY,
          size: fontSize,
          font: font
        });
      } else if (f.type === 'radio') {
        const r = Math.min(boxWidth, boxHeight) / 4;
        const cx = boxX + boxWidth / 2;
        const cy = boxY + boxHeight / 2;
        page.drawCircle({ x: cx, y: cy, size: r, borderWidth: 1 });
      }
    }

    const signedBytes = await pdfDoc.save();
    const signedHash = crypto.createHash('sha256').update(signedBytes).digest('hex');

    const namePart = path.basename(pdfId, path.extname(pdfId));
    const stampedName = namePart + '-signed-' + Date.now() + '.pdf';
    const signedPath = path.join(signedDir, stampedName);
    fs.writeFileSync(signedPath, signedBytes);

    if (mongoUrl) {
      try {
        const log = new Audit({
          pdfId: pdfId,
          originalHash: originalHash,
          signedHash: signedHash,
          signedAt: new Date()
        });
        await log.save();
      } catch (err) {
        console.log('Audit save error', err.message || err);
      }
    }

    const url = '/signed/' + stampedName;
    console.log('sign-pdf error', err);
    res.json({ url: url });
  } catch (err) {
    console.log('sign-pdf error', err);
    res.status(500).json({ error: 'Failed to sign PDF' });
  }
});

app.get('/', function (req, res) {
  res.send('BoloForms backend running');
});

app.listen(port, function () {
  console.log('Server listening on port', port);
});
