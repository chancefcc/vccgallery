const express = require("express");
const path = require("path");
const fs = require("fs");
const exif = require("exif-parser");

const app = express();
const photosDirectory = "photos";

const projectTitle = "VCC Gallery";
const authorName = "Chance Jiang";

// Serve static files
app.use(express.static(path.join(__dirname, photosDirectory)));

const getExifData = async (filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const parser = exif.create(buffer);
    const result = parser.tags;
    return result;
  } catch (err) {
    console.error(`Error parsing EXIF for ${filePath}:`, err.message);
    return null;
  }
};

app.get("/", async (req, res) => {
  try {
    const files = await fs.promises.readdir(path.join(__dirname, photosDirectory));

    const mediaFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mov", ".webm", ".webp"].includes(ext);
    });

    const fileDataPromises = mediaFiles.map(async (file) => {
      const filePath = path.join(__dirname, photosDirectory, file);
      const ext = path.extname(file).toLowerCase();
      let caption = "";

      if ([".jpg", ".jpeg"].includes(ext)) {
        const exifData = await getExifData(filePath);
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
          caption = path.parse(file).name.split(/[-_]+/).join(" ").trim();
        }
      }

      return { file, caption, ext };
    });

    const fileData = await Promise.all(fileDataPromises);

    const fileListHtml = fileData
      .map((data, index) => {
        const mediaElement = [".mp4", ".mov", ".webm"].includes(data.ext)
          ? `<video src="/${data.file}" controls preload="metadata"></video>`
          : `<img src="/${data.file}" alt="${data.caption}">`;

        return `
        <div class="media-container" data-index="${index}">
          <a href="#" class="media-link">
            ${mediaElement}
          </a>
          <p>${data.caption}</p>
        </div>
      `;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${projectTitle}</title>
          <style>
              /* Light/Dark Theme Variables */
              :root {
                --bg-color: #f0f2f5;
                --text-color: #333;
                --card-bg: #fff;
                --border-color: #ccc;
                --shadow-color: rgba(0,0,0,0.1);
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
              .media-container { width: 250px; text-align: center; border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; box-shadow: 0 4px 6px var(--shadow-color); background-color: var(--card-bg); cursor: pointer; transition: background-color 0.3s, box-shadow 0.3s; }
              .media-container img, .media-container video { max-width: 100%; height: auto; display: block; margin: 0 auto 10px; border-radius: 4px; }
              a { text-decoration: none; color: inherit; }
              p { margin: 0; padding: 0; word-wrap: break-word; font-size: 0.9em; color: var(--text-color); }

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
          </style>
      </head>
      <body>
          <div class="header">
            <h1>${projectTitle}</h1>
            <p>A gallery by ${authorName}</p>
          </div>

          <div class="theme-select-wrapper">
            <select id="theme-select">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

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
            const mediaFiles = ${JSON.stringify(fileData)};
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
              const file = mediaFiles[currentIndex];

              modalMediaWrapper.innerHTML = '';
              const mediaElement = document.createElement(file.ext.includes('mp4') || file.ext.includes('mov') || file.ext.includes('webm') ? 'video' : 'img');
              mediaElement.src = '/' + file.file;
              mediaElement.alt = file.caption;

              if (mediaElement.tagName === 'VIDEO') {
                  mediaElement.controls = true;
                  mediaElement.preload = "metadata";
              }
              mediaElement.classList.add('modal-content');
              modalMediaWrapper.appendChild(mediaElement);

              captionText.innerHTML = file.caption;
              modal.style.display = "block";
            };

            // Event listeners for thumbnails
            document.querySelectorAll('.media-container').forEach(container => {
                container.addEventListener('click', (e) => {
                    e.preventDefault();
                    const index = parseInt(container.dataset.index);
                    showModal(index);
                });
            });

            // Close the modal
            document.querySelector('.close').addEventListener('click', () => {
              modal.style.display = "none";
              const video = modalMediaWrapper.querySelector('video');
              if (video) video.pause();
            });

            // Navigation functions
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

            // Theme management
            const applyTheme = (theme) => {
                if (theme === 'dark') {
                    body.classList.add('dark-mode');
                } else if (theme === 'light') {
                    body.classList.remove('dark-mode');
                } else { // 'system'
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (prefersDark) {
                        body.classList.add('dark-mode');
                    } else {
                        body.classList.remove('dark-mode');
                    }
                }
            };

            const setInitialTheme = () => {
                const hour = new Date().getHours();
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                // Set initial theme based on system preference and time
                if (prefersDark || hour >= 19 || hour < 6) {
                    themeSelect.value = 'system';
                    applyTheme('system');
                } else {
                    themeSelect.value = 'system';
                    applyTheme('system');
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
    res.send(html);
  } catch (err) {
    console.error("Error in main route:", err);
    res.status(500).send("An error occurred while building the gallery.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
