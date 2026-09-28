const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Blog title is required'],
      trim: true,
    },
    desc: {
      type: String,
      required: [true, 'Blog short description is required'],
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    author: {
      type: String,
      default: 'Admin Specialist',
      trim: true,
    },
    category: {
      type: String,
      default: 'Property',
      trim: true,
    },
    date: {
      type: String,
      default: () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    },
    image: {
      type: String,
      default: '/images/blog/blog-1.jpg',
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Blog', BlogSchema);
