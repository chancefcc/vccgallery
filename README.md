Express.js server serving local directory's media files to local web browser

# How to install

First, clone the repository to your local machine using git:

```
git clone https://github.com/chancefcc/vccgallery.git
cd vccgallery
```

Next, install the required Node.js packages by running the following command in your terminal:

```
npm install
```

---

# Where to put your photos (media files)

To use the gallery, place all your media files (photos and videos) inside a directory named **`photos`** in the project's root folder.

For example, your file structure should look like this:

```
/vccgallery
├─── photos
│    ├─── my-photo.jpg
│    ├─── vacation-video.mp4
│    └─── another-photo.png
├─── node\_modules/
├─── package.json
├─── server.js
└─── README.md
```

---

# How to run this server

Once you've installed the packages and placed your media files in the `photos` folder, you can start the server by running the following command:

```
npm start
```

The server will then be accessible in your web browser at `http://localhost:3000`.
