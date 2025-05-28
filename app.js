const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();

// Models (make sure you have these Mongoose models in ./models/user and ./models/post)
const userModel = require('./models/user');
const postModel = require('./models/post');

mongoose.connect("mongodb://127.0.0.1:27017/mini_Project", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});



// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Authentication middleware
function isLoggedIn(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');

  try {
    const decoded = jwt.verify(token, 'xyzzz'); // Use environment variable for secret in production
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send('Invalid or expired token');
  }
}

// Routes

// Public routes
app.get('/', (req, res) => {
  res.render('homeLO'); // Home page for logged-out users
});

app.get('/home', (req, res) => {
  res.render('home');
});


app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/register', (req, res) => {
  res.render('register');
});

// Protected routes
app.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const posts = await postModel.find({ user: user._id }).populate('user').sort({ createdAt: -1 });
    res.render('profile', { user, posts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/post', isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).send('Post content cannot be empty.');
    }

    const post = await postModel.create({
      user: user._id,
      content,
    });

    user.posts.push(post._id);
    await user.save();

    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

app.post('/register', async (req, res) => {
  try {
    const { email, password, username, name, age } = req.body;

    const existingUser = await userModel.findOne({ email });
    if (existingUser) return res.status(400).send('User already registered');

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const newUser = await userModel.create({
      username,
      email,
      age,
      name,
      password: hash,
    });

    const token = jwt.sign({ email: newUser.email, userid: newUser._id }, 'xyzzz');
    res.cookie('token', token, { httpOnly: true });

    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) return res.status(400).send('Invalid credentials');

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).send('wrong password');

    const token = jwt.sign({ email: user.email, userid: user._id }, 'xyzzz');
    res.cookie('token', token);

    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/delete/:id', isLoggedIn, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await postModel.findByIdAndDelete(postId);

    if (post) {
      await userModel.findByIdAndUpdate(post.user, { $pull: { posts: postId } });
    }

    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/edit/:id', isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id);
    res.render('edit', { post });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/edit/:id', isLoggedIn, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).send('Post content cannot be empty.');
    }

    await postModel.findByIdAndUpdate(req.params.id, { content });
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/post/:id/like', isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.userid;
    const index = post.likes.findIndex((id) => id.toString() === userId);

    let liked;
    if (index === -1) {
      post.likes.push(userId);
      liked = true;
    } else {
      post.likes.splice(index, 1);
      liked = false;
    }

    await post.save();

    res.json({ liked, likeCount: post.likes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/posts', isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const posts = await postModel.find().populate('user').sort({ createdAt: -1 });
    res.render('allposts', { user, posts });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Show all users (connection page)
app.get('/connections', isLoggedIn, async (req, res) => {
  try {
    // Find all users except current logged-in user
    const users = await userModel.find({ email: { $ne: req.user.email } }).select('username name email');
    const currentUser = await userModel.findOne({ email: req.user.email });
    res.render('connections', { users, currentUser });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
app.get('/user/:id', isLoggedIn, async (req, res) => {
  try {
    const profileUser = await userModel.findById(req.params.id).select('username name email');
    if (!profileUser) return res.status(404).send('User not found');

    const posts = await postModel.find({ user: profileUser._id }).populate('user').sort({ createdAt: -1 });

    res.render('seeprofile', {
      user: req.user,          // logged-in user
      profileUser,             // profile owner
      posts                    // posts by profileUser
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


// Start Server
app.listen(3000, () => console.log("Server running on http://localhost:3000"));
