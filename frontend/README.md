# 🖼️ PixelFlow — Frontend

A responsive web interface for **PixelFlow — Serverless Image Processing & Resizing System on AWS**. The frontend allows users to upload images, monitor processing activity, and view resized image outputs through a simple, modern interface.

---

## ✨ Features

* 📤 **Image Upload** — Select an image or drag and drop it into the upload area.
* ✅ **File Validation** — Validate supported JPEG and PNG files and enforce a 10 MB client-side size limit.
* 🔗 **Secure Uploads** — Request presigned upload URLs from the backend and upload files directly to Amazon S3.
* 🖼️ **Image Studio** — Upload images and view the generated Thumbnail, Medium, and Large variants.
* 🕘 **Processing History** — View processing activity tracked by the frontend session.
* 🗂️ **Storage** — View processed images known to the current frontend session.
* ⚡ **Processing Status** — Display upload status and wait for processed results to become available.
* 📱 **Responsive Design** — Navigate the interface on desktop and smaller screens.
* ☁️ **AWS Integration** — Communicate with Amazon API Gateway and use presigned S3 URLs.

> **Note:** Processing History and Storage are frontend views. Persistent history and a complete live S3 inventory require corresponding backend functionality.

## 🧰 Technologies Used

| Technology            | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| 🧱 HTML5              | Page structure and interface elements                         |
| 🎨 CSS3               | Styling, layouts, and responsive design                       |
| ⚡ JavaScript          | Upload handling, navigation, API requests, and result display |
| ☁️ Amazon API Gateway | Connects the frontend to backend endpoints                    |
| 🪣 Amazon S3          | Stores original and processed images                          |
| 🔗 Presigned URLs     | Enable temporary access to upload and retrieve images         |
| 🐍 Python HTTP Server | Local development server                                      |

## 🏗️ Frontend Architecture

```text
                  👤 User
                    |
                    v
            🖥️ PixelFlow Frontend
                    |
          +---------+----------+
          |         |          |
          v         v          v
     🖼️ Image    🕘 History   🗂️ Storage
       Studio        View        View
          |
          v
    🌐 Amazon API Gateway
          |
          v
      ⚙️ AWS Lambda
          |
          v
       🪣 Amazon S3
          |
          v
   🖼️ Processed Images
```

## 📁 Folder Structure

```text
frontend/
├── index.html       # Main page and application layout
├── app.js           # Frontend logic and API integration
└── README.md        # Frontend documentation
```

This structure reflects the main frontend files. If you add separate CSS, JavaScript modules, screenshots, or assets later, update this section accordingly.

## 🖥️ Application Screens

### 🖼️ 1. Image Studio

The main workspace for uploading images and viewing the results.

**Capabilities:**

* Select or drag and drop an image.
* Review the selected file details.
* Validate supported file types and file size.
* Upload the image through a presigned S3 URL.
* Display available resized images.

### 🕘 2. Processing History

Displays processing activity recorded by the frontend.

**Current behavior:** If records are held in browser memory, they may disappear when the page reloads. Persistent history can be implemented using Amazon DynamoDB and a backend API.

### 🗂️ 3. Storage

Displays processed image objects known to the frontend session.

**Current behavior:** A complete S3 inventory requires a backend endpoint to list objects securely and provide fresh presigned URLs when necessary.

## 🔌 Backend API Integration

The frontend uses two API Gateway endpoints.

| Method | Endpoint       | Purpose                                                 |
| ------ | -------------- | ------------------------------------------------------- |
| `POST` | `/upload-url`  | Requests a presigned URL to upload an image             |
| `POST` | `/results-url` | Checks for processed variants and retrieves result URLs |

### 🌐 API Base URL

```text
https://<api-id>.execute-api.ap-south-1.amazonaws.com/prod
```

Replace `<api-id>` with your deployed API Gateway ID.

### 📤 Upload workflow

1. The user selects an image.
2. JavaScript validates the file.
3. The frontend requests a presigned upload URL.
4. The browser uploads the file directly to Amazon S3.
5. S3 invokes the image processor Lambda.
6. The frontend checks the results endpoint for generated images.
7. The interface displays the available variants.

### 🖼️ Processed Image Variants

| Variant   | Target dimensions            |
| --------- | ---------------------------- |
| Thumbnail | 150 × 150 px target          |
| Medium    | Maximum dimension of 800 px  |
| Large     | Maximum dimension of 1600 px |

Actual dimensions depend on the image-processing logic and the original image's aspect ratio.

## ⚙️ Configuration

Before running the frontend, confirm the API URLs in `app.js` point to your deployed API Gateway endpoints.

For the current development environment:

```javascript
const API_URL =
  "https://jq3n2lwak9.execute-api.ap-south-1.amazonaws.com/prod/upload-url";

const RESULTS_API_URL =
  "https://jq3n2lwak9.execute-api.ap-south-1.amazonaws.com/prod/results-url";
```

**Important:** These are development configuration values. Update them if your API changes. Do not put AWS access keys or secret keys in frontend JavaScript.

## ▶️ Run the Frontend Locally

### 📋 Prerequisites

* Python 3 installed.
* Google Chrome or another modern browser.
* Frontend files downloaded or cloned locally.
* AWS backend APIs deployed and accessible.
* API Gateway and S3 CORS configured for the local origin.

### Step 1️⃣ — Open Command Prompt

Navigate to the frontend folder:

```cmd
cd C:\Users\Anuj\Documents\Vivek\serverless-image-processing\frontend
```

Change the path if your project is stored elsewhere.

### Step 2️⃣ — Start the local server

```cmd
python -m http.server 5500
```

### Step 3️⃣ — Open the application

Visit:

**http://localhost:5500**

Keep Command Prompt running while using the application. Press `Ctrl+C` to stop the server.

> The Python HTTP server is for local development and testing, not production hosting.

## 🔐 Security Considerations

* 🔒 Keep the S3 bucket private and Block Public Access enabled.
* 🔑 Never store AWS access keys or secret keys in frontend files.
* 🔗 Use presigned URLs for temporary upload and download access.
* ✅ Validate file types and sizes in the frontend and independently in the backend.
* 🌐 Configure CORS for the required frontend origin only.
* ⏳ Handle expired presigned URLs by requesting new ones.
* 🛡️ Avoid displaying sensitive API or AWS error details to end users.

## 🧪 Testing Checklist

* [ ] The frontend loads at `http://localhost:5500`.
* [ ] Image Studio navigation works.
* [ ] Processing History navigation works.
* [ ] Storage navigation works.
* [ ] Valid JPEG images can be selected and uploaded.
* [ ] Valid PNG images can be selected and uploaded.
* [ ] Unsupported file types are rejected.
* [ ] Files larger than 10 MB are rejected by frontend validation.
* [ ] Upload status updates correctly.
* [ ] The original image reaches the S3 `uploads/` prefix.
* [ ] Processed image variants appear when available.
* [ ] API failures are handled gracefully.
* [ ] Presigned URLs work while they remain valid.
* [ ] The layout remains usable on smaller screens.

## 🛠️ Troubleshooting

### ❌ The frontend does not load

* Confirm the local server is running.
* Check the browser URL.
* Ensure you started the server from the correct folder.

### ❌ Image upload fails

* Verify the API endpoint in `app.js`.
* Check browser developer tools → **Network** and **Console**.
* Confirm API Gateway CORS configuration.
* Check that the presigned upload URL is valid.

### ❌ Processed images do not appear

* Confirm the original image exists in S3.
* Check the image processor Lambda logs in CloudWatch.
* Verify that the expected output files exist in the `processed/` prefixes.
* Confirm the results API response matches what the frontend expects.

### ❌ History or Storage is empty

* Confirm that an image has been uploaded and its processing results are available.
* Check whether the current implementation tracks results only during the browser session.
* Confirm that the backend returns the expected result information.

## 🚀 Future Improvements

* 💾 Persist processing history using Amazon DynamoDB.
* 🔄 Refresh processing status automatically.
* 🗂️ Display a complete S3 inventory through a secure backend API.
* 🔍 Add search, filtering, and sorting for processed images.
* 📱 Improve mobile layouts and accessibility.
* 🧪 Add automated frontend tests.
* 🌐 Deploy the frontend using Amazon S3 and Amazon CloudFront.
* 🔁 Add automated deployment through GitHub Actions.

## 👤 Author

**Vivek**

*PixelFlow frontend developed as part of a hands-on AWS serverless image-processing project.*

---

⭐ **Project:** PixelFlow — Serverless Image Processing & Resizing System on AWS
☁️ **Cloud Platform:** Amazon Web Services (AWS)
🧰 **Frontend:** HTML, CSS, JavaScript
⚙️ **Backend Integration:** Amazon API Gateway, AWS Lambda, and Amazon S3
