const loadHomepage = async (req, res) => {
    try {
        return res.render("home");
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
};

const pageNotFound = async (req, res) => {
    try {
        return res.render('errorpage');
    } catch (error) {
        console.error(error);
        res.status(500).send("Something went wrong");
    }
};

module.exports = { loadHomepage, pageNotFound };