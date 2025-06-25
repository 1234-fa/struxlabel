const express=require('express');
const app=express();
const path=require('path')
const session=require('express-session');
const passport=require('./config/passport');
const morgan = require('morgan');
const env=require('dotenv').config();
const userRouter=require('./routes/userRouter');
const adminRouter=require('./routes/adminRouter')
const db=require("./config/db");
const {StatusCode} = require('./config/statuscode');
db()

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({extended:true}))

app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))


app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
  });

app.set('view engine','ejs')
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname,'public')));

app.use('/',userRouter);
app.use('/admin',adminRouter);

app.use((req, res, next) => {
    res.status(StatusCode.NOT_FOUND).render('errorpage', { 
        message: 'Page not found', 
        status: StatusCode.NOT_FOUND 
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || StatusCode.INTERNAL_SERVER_ERROR).render('errorpage', { 
        message: err.message || 'Internal Server Error', 
        status: err.status || StatusCode.INTERNAL_SERVER_ERROR 
    });
});

app.listen(process.env.PORT,()=>{
    console.log("server running");
})


module.exports=app;