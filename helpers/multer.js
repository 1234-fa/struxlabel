const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../public/uploads/product-images"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedMimeTypes.includes(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Only images are allowed (jpeg, jpg, png, webp)"));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
    fieldSize: 25 * 1024 * 1024, // 25MB field size limit (increased)
    fieldNameSize: 100, // Field name size limit
    fields: 20, // Max number of non-file fields
    files: 10, // Max number of file fields
    parts: 30, // Max number of parts (fields + files)
  },
  fileFilter,
});

module.exports = upload;
