const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");

dotenv.config(); // ✅ Load environment variables

const app = express();

// Debug: Confirm MONGO_URI is loaded
console.log("MONGO_URI from .env:", process.env.MONGO_URI);

// Models
const userModel = require("./models/user");
const postModel = require("./models/post");

// Connect to MongoDB Atlas
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Authentication middleware
function isLoggedIn(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send("Invalid or expired token");
  }
}

// Public Routes
app.get("/", (req, res) => res.render("homeLO"));
app.get("/home", (req, res) => res.render("home"));
app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));

// Register
app.post("/register", async (req, res) => {
  try {
    const { email, password, username, name, age } = req.body;
    const existingUser = await userModel.findOne({ email });
    if (existingUser) return res.status(400).send("User already registered");

    const hash = await bcrypt.hash(password, 10);
    const newUser = await userModel.create({ email, password: hash, username, name, age });

    const token = jwt.sign({ email: newUser.email, userid: newUser._id }, process.env.JWT_SECRET);
    res.cookie("token", token, { httpOnly: true });
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });
    if (!user) return res.status(400).send("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Wrong password");

    const token = jwt.sign({ email: user.email, userid: user._id }, process.env.JWT_SECRET);
    res.cookie("token", token, { httpOnly: true });
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Logout
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// Profile
app.get("/profile", isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const posts = await postModel.find({ user: user._id }).populate("user").sort({ createdAt: -1 });
    res.render("profile", { user, posts });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Create Post
app.post("/post", isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const { content } = req.body;
    if (!content.trim()) return res.status(400).send("Post content cannot be empty");

    const post = await postModel.create({ user: user._id, content });
    user.posts.push(post._id);
    await user.save();

    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Like/Unlike
app.post("/post/:id/like", isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const userId = req.user.userid;
    const index = post.likes.findIndex((id) => id.toString() === userId);

    if (index === -1) {
      post.likes.push(userId);
    } else {
      post.likes.splice(index, 1);
    }

    await post.save();
    res.json({ liked: index === -1, likeCount: post.likes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Edit Post
app.get("/edit/:id", isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id);
    res.render("edit", { post });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.post("/edit/:id", isLoggedIn, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content.trim()) return res.status(400).send("Post content cannot be empty");
    await postModel.findByIdAndUpdate(req.params.id, { content });
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Delete Post
app.get("/delete/:id", isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findByIdAndDelete(req.params.id);
    if (post) {
      await userModel.findByIdAndUpdate(post.user, { $pull: { posts: post._id } });
    }
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// All Posts
app.get("/posts", isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    const posts = await postModel.find().populate("user").sort({ createdAt: -1 });
    res.render("allposts", { user, posts });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// All Users (Connections)
app.get("/connections", isLoggedIn, async (req, res) => {
  try {
    const users = await userModel.find({ email: { $ne: req.user.email } }).select("username name email");
    const currentUser = await userModel.findOne({ email: req.user.email });
    res.render("connections", { users, currentUser });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// View a User Profile
app.get("/user/:id", isLoggedIn, async (req, res) => {
  try {
    const profileUser = await userModel.findById(req.params.id).select("username name email");
    if (!profileUser) return res.status(404).send("User not found");

    const posts = await postModel.find({ user: profileUser._id }).populate("user").sort({ createdAt: -1 });
    res.render("seeprofile", {
      user: req.user,
      profileUser,
      posts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
