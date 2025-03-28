const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');


router.get('/', userController.loadHomepage);
router.get('/pagenotfound', userController.pageNotFound);

module.exports = router;
