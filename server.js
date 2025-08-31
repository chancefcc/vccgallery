const express = require("express");
const path = require("path");
const fs = require("fs");
const exif = require("exif-parser");

const app = express();
// Read photosDirectory from environment variable, default to 'photos'
const photosDirectory = process.env.GALLERY_ROOT || "photos";

const projectTitle = "VCC Gallery";
const authorName = "Chance Jiang";

// Serve static files from the photos directory and its subdirectories
// This should be placed at the top to ensure static files (like images, videos, CSS) are served directly.
app.use(express.static(path.join(__dirname, photosDirectory)));

const getExifData = async (filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const parser = exif.create(buffer);
    const result = parser.tags;
    return result;
  } catch (err) {
    // console.error(`Error parsing EXIF for ${filePath}:`, err.message); // Suppress frequent errors for non-JPGs
    return null;
  }
};

// Helper function to get media files from a given directory
const getMediaFilesFromDirectory = async (directoryPath) => {
  try {
    const files = await fs.promises.readdir(directoryPath);
    return files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mov", ".webm", ".webp"].includes(ext);
    });
  } catch (error) {
    console.error(`Error reading media files from ${directoryPath}:`, error.message);
    return [];
  }
};

// Helper function to find a cover image for a folder
const findFolderCover = async (folderFullPath, folderRelativePath) => {
  const mediaFiles = await getMediaFilesFromDirectory(folderFullPath);

  let coverFileName = null;
  // Prioritize files named 'cover.*' (case-insensitive and prefix match)
  const potentialCovers = mediaFiles.filter((file) => path.parse(file).name.toLowerCase().startsWith("cover"));
  if (potentialCovers.length > 0) {
    // Pick the first cover file found
    coverFileName = potentialCovers[0];
  } else if (mediaFiles.length > 0) {
    // If no 'cover' file, use the first media file
    coverFileName = mediaFiles[0];
  }

  if (coverFileName) {
    const coverFilePath = path.join(folderFullPath, coverFileName);
    const coverFileRelativePath = path.join(folderRelativePath, coverFileName);
    let caption = folderRelativePath.split(path.sep).pop().split(/[-_]+/).join(" ").trim(); // Default caption from folder name

    // Try to get EXIF from cover if it's a JPG/JPEG
    if ([".jpg", ".jpeg"].includes(path.extname(coverFileName).toLowerCase())) {
      const exifData = await getExifData(coverFilePath);
      if (exifData && exifData.ImageDescription) {
        caption = exifData.ImageDescription.trim();
      }
    }

    return {
      url: `/${coverFileRelativePath}`,
      caption: caption,
      ext: path.extname(coverFileName).toLowerCase(),
    };
  }
  return null; // No suitable cover found
};

// Helper to process a single media file for modal data
const processMediaFileForModal = async (fullPath, relativePath) => {
  const ext = path.extname(fullPath).toLowerCase();
  let caption = "";

  if ([".jpg", ".jpeg"].includes(ext)) {
    const exifData = await getExifData(fullPath);
    if (exifData) {
      const captionTags = ["ImageDescription", "Title", "ObjectName"];
      for (const tag of captionTags) {
        if (exifData[tag]) {
          caption = exifData[tag].trim();
          break;
        }
      }
      if (!caption) {
        if (exifData.DateTimeOriginal) {
          const date = new Date(exifData.DateTimeOriginal * 1000);
          caption = date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        } else if (exifData.Model) {
          caption = exifData.Model;
        }
      }
    }
  }
  if (!caption) {
    if ([".mp4", ".mov", ".webm"].includes(ext)) {
      caption = "Video";
    } else {
      caption = path.parse(relativePath).name.split(/[-_]+/).join(" ").trim();
    }
  }
  return { file: relativePath, caption: caption, ext: ext };
};

// Route for the main gallery view
app.get("/", async (req, res) => {
  try {
    const entries = await fs.promises.readdir(path.join(__dirname, photosDirectory), { withFileTypes: true });

    const galleryItemsPromises = entries.map(async (entry) => {
      const entryRelativePath = entry.name;
      const entryFullPath = path.join(__dirname, photosDirectory, entry.name);

      if (entry.isDirectory()) {
        const coverData = await findFolderCover(entryFullPath, entryRelativePath);
        return {
          type: "folder",
          name: entry.name,
          caption: coverData
            ? coverData.caption
            : entryRelativePath.split(path.sep).pop().split(/[-_]+/).join(" ").trim(),
          thumbnailUrl: coverData ? coverData.url : "/folder_icon.png", // Use a generic folder icon if no media (make sure '/folder_icon.png' exists if used)
          link: `/${entry.name}`, // Link now points directly to /folderName
        };
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mov", ".webm", ".webp"].includes(ext)) {
          const fileData = await processMediaFileForModal(entryFullPath, entryRelativePath);
          return {
            type: "file",
            ...fileData,
            thumbnailUrl: `/${entryRelativePath}`,
          };
        }
      }
      return null; // Ignore non-media files or unsupported extensions
    });

    let galleryItems = (await Promise.all(galleryItemsPromises)).filter((item) => item !== null);

    // Sort items: folders first, then files, then alphabetically by name/caption
    galleryItems.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return (a.name || a.caption).localeCompare(b.name || b.caption);
    });

    // Collect ALL individual media files (from root and all subfolders) for the global modal
    const allMediaFilesForModal = [];
    const collectAllMediaFiles = async (currentDir, relativePathSegments = []) => {
      const dirEntries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      await Promise.all(
        dirEntries.map(async (entry) => {
          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.join(...relativePathSegments, entry.name);
          if (entry.isDirectory()) {
            await collectAllMediaFiles(fullPath, [...relativePathSegments, entry.name]);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if ([".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mov", ".webm", ".webp"].includes(ext)) {
              allMediaFilesForModal.push(await processMediaFileForModal(fullPath, relativePath));
            }
          }
        }),
      );
    };
    await collectAllMediaFiles(path.join(__dirname, photosDirectory));

    const fileListHtml = galleryItems
      .map((data) => {
        if (data.type === "folder") {
          // Folder item: Entire container is a link
          return `
                <a href="${data.link}" class="media-container folder-container media-link">
                    <img src="${data.thumbnailUrl}" alt="${data.caption}">
                    <p>${data.caption}</p>
                </a>
            `;
        } else {
          // type is 'file' (loose file in root)
          const mediaElement = [".mp4", ".mov", ".webm"].includes(data.ext)
            ? `<video src="${data.thumbnailUrl}" controls preload="metadata"></video>`
            : `<img src="${data.thumbnailUrl}" alt="${data.caption}">`;

          // Find the index of this file in the `allMediaFilesForModal` array for modal navigation
          const modalIndex = allMediaFilesForModal.findIndex((f) => f.file === data.file);

          return `
                <div class="media-container file-container" data-index="${modalIndex}">
                    <a href="#" class="media-link">
                        ${mediaElement}
                    </a>
                    <p>${data.caption}</p>
                </div>
            `;
        }
      })
      .join("");

    res.send(renderHtmlPage(projectTitle, authorName, fileListHtml, allMediaFilesForModal, "main"));
  } catch (err) {
    console.error("Error in main route:", err);
    res.status(500).send("An error occurred while building the gallery.");
  }
});

// Dynamic route to handle requests for sub-folders
// This must be AFTER app.get('/') to prioritize the homepage,
// but BEFORE any general 404 handler.
app.get("/:potentialFolderName", async (req, res, next) => {
  const folderName = req.params.potentialFolderName;
  const folderFullPath = path.join(__dirname, photosDirectory, folderName);

  try {
    const stat = await fs.promises.stat(folderFullPath);
    if (stat.isDirectory()) {
      // If it's a directory, render the folder's gallery view
      const folderRelativePath = folderName; // relative to photosDirectory

      const mediaFiles = await getMediaFilesFromDirectory(folderFullPath);

      const folderMediaFilesForModalPromises = mediaFiles.map(async (file) => {
        const fullPath = path.join(folderFullPath, file);
        const relativePath = path.join(folderRelativePath, file);
        return await processMediaFileForModal(fullPath, relativePath);
      });
      const folderMediaFilesForModal = await Promise.all(folderMediaFilesForModalPromises);

      const fileListHtml = folderMediaFilesForModal
        .map((data, index) => {
          const mediaElement = [".mp4", ".mov", ".webm"].includes(data.ext)
            ? `<video src="/${data.file}" controls preload="metadata"></video>`
            : `<img src="/${data.file}" alt="${data.caption}">`;

          return `
          <div class="media-container file-container" data-index="${index}">
            <a href="#" class="media-link">
              ${mediaElement}
            </a>
            <p>${data.caption}</p>
          </div>
        `;
        })
        .join("");

      res.send(
        renderHtmlPage(
          `${projectTitle} - ${folderName}`,
          authorName,
          fileListHtml,
          folderMediaFilesForModal,
          "folder",
          folderName,
        ),
      );
    } else {
      // If it's not a directory (e.g., a file or something else), pass control to the next middleware
      next();
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      // Path not found, pass control to the next middleware (e.g., a 404 handler)
      next();
    } else {
      console.error(`Error in dynamic route /${folderName}:`, err);
      res.status(500).send("An error occurred while building the folder gallery.");
    }
  }
});

// Function to render the full HTML page (to avoid duplication)
const renderHtmlPage = (title, author, fileListHtml, mediaFilesForModal, viewType, currentFolder = "") => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <style>
              /* Light/Dark Theme Variables */
              :root {
                --bg-color: #f0f2f5;
                --text-color: #333;
                --card-bg: #fff;
                --border-color: #ccc;
                --shadow-color: rgba(0,0,0,0.1);
                --brand-color: #C4A484; /* Defined brand color */
              }
              body.dark-mode {
                --bg-color: #3b3b3b;
                --text-color: #f0f2f5;
                --card-bg: #4a4a4a;
                --border-color: #666;
                --shadow-color: rgba(0,0,0,0.3);
              }

              body { font-family: sans-serif; display: flex; flex-wrap: wrap; gap: 20px; padding: 20px; background-color: var(--bg-color); color: var(--text-color); transition: background-color 0.3s, color 0.3s; }
              .header { width: 100%; text-align: center; padding-bottom: 20px; border-bottom: 2px solid var(--border-color); margin-bottom: 20px; }
              .media-container {
                width: 250px;
                text-align: center;
                border: 1px solid var(--border-color);
                padding: 10px;
                border-radius: 8px;
                box-shadow: 0 4px 6px var(--shadow-color);
                background-color: var(--card-bg); /* Default background for file containers */
                cursor: pointer;
                transition: background-color 0.3s, box-shadow 0.3s;
                /* Added for folder links to behave as blocks */
                display: flex;
                flex-direction: column;
                text-decoration: none; /* Ensure no underline on folder links */
                color: inherit; /* Inherit text color for folder links */
              }
              /* Styling for sub-folders on main page, using brand color */
              a.media-container.folder-container {
                background-color: var(--brand-color);
                border: 1px solid var(--border-color); /* Keep existing border for consistency */
                box-shadow: 0 6px 12px var(--shadow-color); /* Slightly more prominent shadow */
              }
              /* Text color for paragraphs inside folder containers */
              a.media-container.folder-container p {
                color: #ffffff; /* White text for readability on brand background */
              }


              .media-container img, .media-container video { max-width: 100%; height: auto; display: block; margin: 0 auto 10px; border-radius: 4px; }
              a.media-link { text-decoration: none; color: inherit; } /* Specific for internal modal links */
              p { margin: 0; padding: 0; word-wrap: break-word; font-size: 0.9em; color: var(--text-color); } /* Default for other paragraphs */

              /* Folder specific styling */
              .folder-container img {
                max-height: 200px; /* Limit height for folder covers */
                object-fit: cover; /* Ensure covers fill space nicely */
              }

              /* Modal Styles */
              .modal { display: none; position: fixed; z-index: 100; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.9); }
              .modal-content { margin: auto; display: block; max-width: 90%; max-height: 90vh; }
              .modal-caption { margin: auto; display: block; width: 80%; max-width: 700px; text-align: center; color: #ccc; padding: 10px 0; }
              .close { position: absolute; top: 15px; right: 35px; color: #f1f1f1; font-size: 40px; font-weight: bold; transition: 0.3s; cursor: pointer; }
              .modal-nav { position: absolute; top: 50%; width: auto; padding: 16px; margin-top: -50px; color: #fff; font-size: 40px; font-weight: bold; cursor: pointer; user-select: none; }
              .prev { left: 0; }
              .next { right: 0; }

              /* Dropdown for Theme Switching */
              .theme-select-wrapper { position: fixed; top: 20px; right: 20px; }
              #theme-select {
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 1em;
                background-color: var(--card-bg);
                color: var(--text-color);
                border: 1px solid var(--border-color);
                cursor: pointer;
              }
              #theme-select option {
                background-color: var(--card-bg);
                color: var(--text-color);
              }
              /* Back button specific styling */
              .back-button-wrapper { width: 100%; text-align: left; margin-bottom: 20px;}
              .back-button {
                display: inline-block;
                padding: 10px 15px;
                background-color: var(--card-bg);
                color: var(--text-color);
                border: 1px solid var(--border-color);
                border-radius: 5px;
                text-decoration: none;
                font-size: 0.9em;
                transition: background-color 0.3s;
              }
              .back-button:hover {
                background-color: var(--border-color);
              }
          </style>
      </head>
      <body>
          <div class="header">
            <h1>${title}</h1>
            <p>A gallery by ${author}</p>
          </div>

          <div class="theme-select-wrapper">
            <select id="theme-select">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          ${viewType === "folder" ? `<div class="back-button-wrapper"><a href="/" class="back-button">&#8592; Back to Gallery</a></div>` : ""}

          ${fileListHtml}

          <div id="myModal" class="modal">
            <span class="close">&times;</span>
            <div class="modal-nav prev">&#10094;</div>
            <div class="modal-nav next">&#10095;</div>
            <div class="modal-media-wrapper">
              </div>
            <div id="caption" class="modal-caption"></div>
          </div>

          <script>
            const mediaFiles = ${JSON.stringify(mediaFilesForModal)};
            let currentIndex = 0;
            const modal = document.getElementById("myModal");
            const modalMediaWrapper = document.querySelector(".modal-media-wrapper");
            const captionText = document.getElementById("caption");
            const prevBtn = document.querySelector(".prev");
            const nextBtn = document.querySelector(".next");
            const themeSelect = document.getElementById('theme-select');
            const body = document.body;

            // Function to show the modal with the selected media
            const showModal = (index) => {
              currentIndex = index;
              if (currentIndex < 0 || currentIndex >= mediaFiles.length) return; // Boundary check

              const file = mediaFiles[currentIndex];

              modalMediaWrapper.innerHTML = ''; // Clear previous content
              const mediaElement = document.createElement(file.ext.includes('mp4') || file.ext.includes('mov') || file.ext.includes('webm') ? 'video' : 'img');
              mediaElement.src = '/' + file.file;
              mediaElement.alt = file.caption;

              if (mediaElement.tagName === 'VIDEO') {
                  mediaElement.controls = true;
                  mediaElement.preload = "metadata";
                  mediaElement.autoplay = true; // Autoplay videos when opened in modal
                  mediaElement.loop = true; // Loop videos
              }
              mediaElement.classList.add('modal-content');
              modalMediaWrapper.appendChild(mediaElement);

              captionText.innerHTML = file.caption;
              modal.style.display = "block";
            };

            // Event listeners for file thumbnails (opens modal)
            document.querySelectorAll('.media-container.file-container').forEach(container => {
                container.addEventListener('click', (e) => {
                    e.preventDefault(); // Prevent default navigation to open modal
                    const index = parseInt(container.dataset.index);
                    showModal(index);
                });
            });

            // Close the modal
            document.querySelector('.close').addEventListener('click', () => {
              modal.style.display = "none";
              const video = modalMediaWrapper.querySelector('video');
              if (video) video.pause(); // Pause video when modal closes
            });

            // Navigation functions for modal
            const showNext = () => {
              currentIndex = (currentIndex + 1) % mediaFiles.length;
              showModal(currentIndex);
            };

            const showPrev = () => {
              currentIndex = (currentIndex - 1 + mediaFiles.length) % mediaFiles.length;
              showModal(currentIndex);
            };

            prevBtn.addEventListener('click', showPrev);
            nextBtn.addEventListener('click', showNext);

            // Close modal with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display === 'block') {
                    modal.style.display = 'none';
                    const video = modalMediaWrapper.querySelector('video');
                    if (video) video.pause();
                }
            });

            // Theme management
            const applyTheme = (theme) => {
                if (theme === 'dark') {
                    body.classList.add('dark-mode');
                    localStorage.setItem('theme', 'dark');
                } else if (theme === 'light') {
                    body.classList.remove('dark-mode');
                    localStorage.setItem('theme', 'light');
                } else { // 'system'
                    localStorage.removeItem('theme'); // Clear user preference
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (prefersDark) {
                        body.classList.add('dark-mode');
                    } else {
                        body.classList.remove('dark-mode');
                    }
                }
            };

            const setInitialTheme = () => {
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme) {
                    themeSelect.value = savedTheme;
                    applyTheme(savedTheme);
                } else {
                    themeSelect.value = 'system';
                    applyTheme('system'); // Apply system preference
                }
            };

            // Event listener for the dropdown menu
            themeSelect.addEventListener('change', (e) => {
                const selectedTheme = e.target.value;
                applyTheme(selectedTheme);
            });

            // Set the initial theme on page load
            setInitialTheme();
          </script>
      </body>
      </html>
`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
