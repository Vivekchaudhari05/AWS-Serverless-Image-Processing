
const imageInput = document.getElementById("imageInput");
const uploadButton = document.getElementById("uploadButton");
const status = document.getElementById("status");

const dropZone = document.getElementById("dropZone");
const selectedFile = document.getElementById("selectedFile");
const filePreview = document.getElementById("filePreview");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileStatus = document.getElementById("fileStatus");

const API_URL =
    "https://jq3n2lwak9.execute-api.ap-south-1.amazonaws.com/prod/upload-url";

const RESULTS_API_URL =
    "https://jq3n2lwak9.execute-api.ap-south-1.amazonaws.com/prod/results-url";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PROCESSING_ATTEMPTS = 12;
const PROCESSING_INTERVAL = 5000;

const ALLOWED_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png"
};

const VARIANTS = ["thumbnail", "medium", "large"];

const VARIANT_LABELS = {
    thumbnail: "Thumbnail",
    medium: "Medium",
    large: "Large"
};

/*
 * History is kept in memory for this browser session.
 * It is not a permanent database or a complete S3 inventory.
 */
const uploadHistory = [];

let currentFile = null;
let previewUrl = null;
let currentRecord = null;
let currentPage = "studio";
let uploadInProgress = false;

const latestResults = {
    thumbnail: null,
    medium: null,
    large: null
};

/* -------------------------
   General helpers
------------------------- */

function showStatus(message, state = "") {
    status.textContent = message;

    if (state) {
        status.dataset.state = state;
    } else {
        delete status.dataset.state;
    }
}

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Size unavailable";
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function validateFile(file) {
    if (!file) {
        return "Please select an image first.";
    }

    const dotIndex = file.name.lastIndexOf(".");
    const extension = dotIndex >= 0
        ? file.name.slice(dotIndex).toLowerCase()
        : "";

    if (
        !ALLOWED_TYPES[extension] ||
        ALLOWED_TYPES[extension] !== file.type
    ) {
        return "Only valid JPG, JPEG, and PNG image files are supported.";
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        return "Choose an image greater than 0 bytes and no larger than 10 MB.";
    }

    return "";
}

/* -------------------------
   Same-page navigation
------------------------- */

function navigateTo(page) {
    if (!["studio", "history", "storage"].includes(page)) {
        return;
    }

    currentPage = page;

    document.querySelectorAll(".page-view").forEach((section) => {
        section.hidden = section.id !== `page-${page}`;
    });

    document.querySelectorAll(".nav-item[data-page]").forEach((button) => {
        const active = button.dataset.page === page;

        button.classList.toggle("active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
    });

    const titles = {
        studio: "Image Studio",
        history: "Processing History",
        storage: "Storage"
    };

    document.getElementById("breadcrumbTitle").textContent = titles[page];

    if (page === "history") {
        renderHistory();
    }

    if (page === "storage") {
        renderStorage();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
        navigateTo(button.dataset.page);
    });
});

document.querySelectorAll("[data-go-page]").forEach((button) => {
    button.addEventListener("click", () => {
        navigateTo(button.dataset.goPage);
    });
});

/* -------------------------
   Local file selection
------------------------- */

function clearPreview() {
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }

    filePreview.replaceChildren();
    filePreview.textContent = "▧";
}

function selectFile(file) {
    const error = validateFile(file);

    if (error) {
        currentFile = null;
        imageInput.value = "";
        selectedFile.hidden = true;
        clearPreview();
        showStatus(error, "error");
        return;
    }

    currentFile = file;
    clearPreview();

    previewUrl = URL.createObjectURL(file);

    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = "Selected image preview";

    filePreview.replaceChildren(image);

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileStatus.textContent = "Ready";
    selectedFile.hidden = false;

    showStatus("Image selected and ready to upload.", "success");
}

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];

    if (file) {
        selectFile(file);
    }
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragging");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragging");
    });
});

dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];

    if (file) {
        selectFile(file);
    } else {
        showStatus("Drop an image file to continue.", "error");
    }
});

/* -------------------------
   Processed image previews
------------------------- */

function resetOutputCards() {
    VARIANTS.forEach((variant) => {
        const preview = document.getElementById(`preview-${variant}`);
        const sizeLabel = document.getElementById(`size-${variant}`);
        const downloadButton = document.querySelector(
            `[data-download-variant="${variant}"]`
        );

        preview.replaceChildren();
        preview.textContent = "▧";

        sizeLabel.textContent = "Awaiting output";
        sizeLabel.classList.add("muted");

        downloadButton.disabled = true;
    });

    VARIANTS.forEach((variant) => {
        latestResults[variant] = null;
    });
}

function setOutputImage(variant, result) {
    const preview = document.getElementById(`preview-${variant}`);
    const sizeLabel = document.getElementById(`size-${variant}`);
    const downloadButton = document.querySelector(
        `[data-download-variant="${variant}"]`
    );

    if (!preview || !result || !result.url) {
        return;
    }

    latestResults[variant] = result;

    let image = preview.querySelector("img");

    if (!image) {
        preview.replaceChildren();

        image = document.createElement("img");
        image.alt = `${VARIANT_LABELS[variant]} processed image`;
        image.loading = "lazy";

        preview.appendChild(image);
    }

    image.onerror = () => {
        sizeLabel.textContent = "Preview could not load";
        sizeLabel.classList.add("muted");
    };

    image.onload = () => {
        sizeLabel.textContent =
            `${image.naturalWidth} × ${image.naturalHeight} px · File size available on download`;
        sizeLabel.classList.remove("muted");
    };

    image.src = result.url;
    downloadButton.disabled = false;

    if (currentRecord) {
        currentRecord.results[variant] = result;
    }
}

function countAvailableResults(results) {
    return VARIANTS.filter((variant) => {
        return results[variant] && results[variant].available &&
            results[variant].url;
    }).length;
}

/* -------------------------
   Results API polling
------------------------- */

async function requestProcessedResults(fileToProcess) {
    const response = await fetch(RESULTS_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fileName: fileToProcess
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Could not retrieve processed images.");
    }

    return data.results || {};
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadProcessedImages(fileToProcess, record = currentRecord) {
    for (let attempt = 1; attempt <= MAX_PROCESSING_ATTEMPTS; attempt++) {
        try {
            const results = await requestProcessedResults(fileToProcess);

            if (record) {
                record.results = record.results || {};
            }

            VARIANTS.forEach((variant) => {
                const result = results[variant];

                if (result && result.available && result.url) {
                    const normalizedResult = {
                        ...result,
                        variant,
                        available: true
                    };

                    if (record) {
                        record.results[variant] = normalizedResult;
                    }

                    if (record === currentRecord) {
                        setOutputImage(variant, normalizedResult);
                    }
                }
            });

            const availableCount = countAvailableResults(results);

            if (record) {
                record.status = availableCount === 3
                    ? "Completed"
                    : "Processing";
                record.updatedAt = new Date();
            }

            if (record === currentRecord) {
                if (availableCount === 3) {
                    showStatus(
                        "All three processed images are ready!",
                        "success"
                    );
                    fileStatus.textContent = "Processing complete";
                } else {
                    showStatus(
                        `Processing image... ${availableCount}/3 outputs ready. Checking again shortly.`,
                        "working"
                    );
                    fileStatus.textContent = "Processing...";
                }
            }

            renderHistoryIfVisible();
            renderStorageIfVisible();

            if (availableCount === 3) {
                return true;
            }
        } catch (error) {
            console.error("Results request error:", error);

            if (record) {
                record.lastError = error.message;
            }

            if (record === currentRecord) {
                showStatus(
                    `Waiting for processed results. Attempt ${attempt} of ${MAX_PROCESSING_ATTEMPTS}.`,
                    "working"
                );
            }
        }

        if (attempt < MAX_PROCESSING_ATTEMPTS) {
            await wait(PROCESSING_INTERVAL);
        }
    }

    if (record) {
        const availableCount = VARIANTS.filter((variant) => {
            return record.results && record.results[variant] &&
                record.results[variant].url;
        }).length;

        record.status = availableCount > 0
            ? "Partially processed"
            : "Results unavailable";
        record.updatedAt = new Date();
    }

    if (record === currentRecord) {
        const availableCount = VARIANTS.filter((variant) => {
            return latestResults[variant] && latestResults[variant].url;
        }).length;

        showStatus(
            `${availableCount}/3 processed images are available. You can retry from Processing History.`,
            availableCount > 0 ? "working" : "error"
        );

        fileStatus.textContent = availableCount > 0
            ? "Partially processed"
            : "Results unavailable";
    }

    renderHistoryIfVisible();
    renderStorageIfVisible();

    return false;
}

/* -------------------------
   Upload to S3
------------------------- */

uploadButton.addEventListener("click", async () => {
    if (uploadInProgress) {
        return;
    }

    if (!currentFile) {
        showStatus("Please select a valid image before uploading.", "error");
        return;
    }

    const validationError = validateFile(currentFile);

    if (validationError) {
        showStatus(validationError, "error");
        return;
    }

    const file = currentFile;

    uploadInProgress = true;
    uploadButton.disabled = true;
    fileStatus.textContent = "Uploading...";

    resetOutputCards();

    const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        uploadedAt: new Date(),
        updatedAt: new Date(),
        status: "Uploading",
        results: {},
        lastError: ""
    };

    uploadHistory.unshift(record);
    currentRecord = record;

    renderHistoryIfVisible();

    try {
        showStatus("Requesting secure upload URL...", "working");

        const urlResponse = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fileName: file.name,
                contentType: file.type,
                fileSize: file.size
            })
        });

        const urlData = await urlResponse.json();

        if (!urlResponse.ok) {
            throw new Error(urlData.error || "Could not obtain upload URL.");
        }

        if (!urlData.uploadUrl) {
            throw new Error("The upload API did not return an upload URL.");
        }

        showStatus("Uploading image securely to Amazon S3...", "working");

        const uploadResponse = await fetch(urlData.uploadUrl, {
            method: "PUT",
            headers: {
                "Content-Type": file.type
            },
            body: file
        });

        if (!uploadResponse.ok) {
            throw new Error(
                `S3 upload failed with status ${uploadResponse.status}.`
            );
        }

        record.status = "Processing";
        record.updatedAt = new Date();

        fileStatus.textContent = "Uploaded";

        showStatus(
            "Upload successful! Waiting for AWS Lambda to process the image...",
            "working"
        );

        renderHistoryIfVisible();

        await loadProcessedImages(file.name, record);
    } catch (error) {
        console.error("Upload error:", error);

        record.status = "Upload failed";
        record.lastError = error.message;
        record.updatedAt = new Date();

        fileStatus.textContent = "Failed";
        showStatus(`Upload failed: ${error.message}`, "error");

        renderHistoryIfVisible();
    } finally {
        uploadInProgress = false;
        uploadButton.disabled = false;
    }
});

/* -------------------------
   Download processed image
------------------------- */

async function downloadResult(result, suggestedName) {
    if (!result || !result.url) {
        showStatus("This processed image is not available yet.", "error");
        return;
    }

    try {
        showStatus("Preparing your download...", "working");

        const response = await fetch(result.url);

        if (!response.ok) {
            throw new Error(
                `Download request failed with status ${response.status}.`
            );
        }

        const blob = await response.blob();
        const temporaryUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = temporaryUrl;
        link.download = suggestedName;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(temporaryUrl), 1000);

        showStatus(
            `Download started: ${suggestedName}`,
            "success"
        );
    } catch (error) {
        console.error("Download error:", error);
        showStatus(
            `Could not download the image: ${error.message}. You can try opening the image preview.`,
            "error"
        );
    }
}

document.querySelectorAll("[data-download-variant]").forEach((button) => {
    button.addEventListener("click", async () => {
        const variant = button.dataset.downloadVariant;
        const result = latestResults[variant];

        if (!result) {
            showStatus("No processed image is available for download.", "error");
            return;
        }

        const originalName = currentRecord
            ? currentRecord.fileName
            : "image";

        const extension = originalName.toLowerCase().endsWith(".png")
            ? ".png"
            : ".jpg";

        const baseName = originalName.replace(/\.[^.]+$/, "");

        await downloadResult(
            result,
            `${baseName}-${variant}${extension}`
        );
    });
});

/* -------------------------
   History page
------------------------- */

function getStatusClass(record) {
    if (record.status === "Completed") return "success";
    if (record.status === "Processing" || record.status === "Uploading") {
        return "working";
    }
    if (
        record.status === "Upload failed" ||
        record.status === "Results unavailable"
    ) {
        return "error";
    }

    return "";
}

function createStatusPill(record) {
    return makeElement(
        "span",
        `status-pill ${getStatusClass(record)}`,
        record.status
    );
}

function renderHistory() {
    document.getElementById("historyTotal").textContent = uploadHistory.length;

    document.getElementById("historyCompleted").textContent =
        uploadHistory.filter((record) => record.status === "Completed").length;

    document.getElementById("historyOutputs").textContent =
        uploadHistory.reduce((total, record) => {
            return total + VARIANTS.filter((variant) => {
                return record.results[variant] &&
                    record.results[variant].url;
            }).length;
        }, 0);

    const container = document.getElementById("historyContent");
    container.replaceChildren();

    if (uploadHistory.length === 0) {
        const empty = makeElement("div", "empty-state");
        empty.appendChild(makeElement("div", "empty-icon", "◷"));
        empty.appendChild(makeElement("h2", "", "No processing history yet"));
        empty.appendChild(makeElement(
            "p",
            "",
            "Your uploads will appear here after you process your first image. Records are kept for this browser session."
        ));

        const button = makeElement("button", "primary-button", "Upload your first image");
        button.type = "button";
        button.addEventListener("click", () => navigateTo("studio"));

        empty.appendChild(button);
        container.appendChild(empty);
        return;
    }

    const wrap = makeElement("div", "table-wrap");
    const table = makeElement("table", "data-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["Image", "Uploaded", "File size", "Status", "Outputs", "Actions"]
        .forEach((label) => {
            headerRow.appendChild(makeElement("th", "", label));
        });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    uploadHistory.forEach((record) => {
        const row = document.createElement("tr");

        const fileCell = document.createElement("td");
        const fileInfo = makeElement("div", "file-cell");
        fileInfo.appendChild(makeElement("div", "file-cell-icon", "▧"));

        const fileNameWrap = document.createElement("div");
        fileNameWrap.appendChild(makeElement("div", "file-cell-name", record.fileName));
        fileNameWrap.appendChild(makeElement(
            "div",
            "muted",
            record.contentType || "Image"
        ));

        fileInfo.appendChild(fileNameWrap);
        fileCell.appendChild(fileInfo);
        row.appendChild(fileCell);

        row.appendChild(makeElement("td", "", formatDate(record.uploadedAt)));
        row.appendChild(makeElement("td", "", formatFileSize(record.fileSize)));

        const statusCell = document.createElement("td");
        statusCell.appendChild(createStatusPill(record));
        row.appendChild(statusCell);

        const count = VARIANTS.filter((variant) => {
            return record.results[variant] && record.results[variant].url;
        }).length;

        row.appendChild(makeElement("td", "", `${count}/3`));

        const actionsCell = document.createElement("td");
        const actions = makeElement("div", "toolbar-actions");

        const viewButton = makeElement("button", "secondary-button", "View results");
        viewButton.type = "button";
        viewButton.addEventListener("click", () => showRecordInStudio(record));

        actions.appendChild(viewButton);

        if (count < 3 && record.status !== "Upload failed") {
            const retryButton = makeElement("button", "secondary-button", "Retry");
            retryButton.type = "button";
            retryButton.addEventListener("click", () => retryRecord(record));
            actions.appendChild(retryButton);
        }

        actionsCell.appendChild(actions);
        row.appendChild(actionsCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}

function renderHistoryIfVisible() {
    if (currentPage === "history") {
        renderHistory();
    }
}

async function retryRecord(record) {
    currentRecord = record;
    navigateTo("studio");

    resetOutputCards();

    VARIANTS.forEach((variant) => {
        const result = record.results[variant];

        if (result && result.url) {
            setOutputImage(variant, result);
        }
    });

    fileStatus.textContent = "Checking results...";
    showStatus("Checking for processed images again...", "working");

    await loadProcessedImages(record.fileName, record);
}

function showRecordInStudio(record) {
    currentRecord = record;

    resetOutputCards();

    VARIANTS.forEach((variant) => {
        const result = record.results[variant];

        if (result && result.url) {
            setOutputImage(variant, result);
        }
    });

    fileName.textContent = record.fileName;
    fileSize.textContent = formatFileSize(record.fileSize);
    fileStatus.textContent = record.status;
    selectedFile.hidden = false;

    navigateTo("studio");

    const availableCount = VARIANTS.filter((variant) => {
        return record.results[variant] && record.results[variant].url;
    }).length;

    showStatus(
        `${availableCount}/3 results available for ${record.fileName}.`,
        availableCount === 3 ? "success" : "working"
    );

    if (availableCount < 3) {
        loadProcessedImages(record.fileName, record);
    }
}

document.getElementById("refreshHistoryButton").addEventListener(
    "click",
    renderHistory
);

/* -------------------------
   Storage page
------------------------- */

function getAllStoredVariants() {
    const items = [];

    uploadHistory.forEach((record) => {
        VARIANTS.forEach((variant) => {
            const result = record.results[variant];

            if (result && result.url) {
                items.push({
                    record,
                    variant,
                    result
                });
            }
        });
    });

    return items;
}

function renderStorage() {
    const items = getAllStoredVariants();

    document.getElementById("storageObjectCount").textContent = items.length;
    document.getElementById("storageSourceCount").textContent = uploadHistory.length;

    const container = document.getElementById("storageContent");
    container.replaceChildren();

    if (items.length === 0) {
        const empty = makeElement("div", "empty-state");
        empty.appendChild(makeElement("div", "empty-icon", "☁"));
        empty.appendChild(makeElement("h2", "", "No processed files yet"));
        empty.appendChild(makeElement(
            "p",
            "",
            "After an image is processed, its available variants will appear here with temporary access and download options."
        ));

        const button = makeElement("button", "primary-button", "Process an image");
        button.type = "button";
        button.addEventListener("click", () => navigateTo("studio"));

        empty.appendChild(button);
        container.appendChild(empty);
        return;
    }

    const wrap = makeElement("div", "table-wrap");
    const table = makeElement("table", "data-table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    ["Processed image", "Variant", "Dimensions", "Source upload", "Actions"]
        .forEach((label) => {
            headRow.appendChild(makeElement("th", "", label));
        });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    items.forEach(({ record, variant, result }) => {
        const row = document.createElement("tr");

        const imageCell = document.createElement("td");
        const imageInfo = makeElement("div", "storage-variant");
        const thumb = makeElement("div", "storage-thumb");

        const image = document.createElement("img");
        image.src = result.url;
        image.alt = `${VARIANT_LABELS[variant]} preview`;
        image.loading = "lazy";
        image.onerror = () => {
            thumb.replaceChildren();
            thumb.textContent = "▧";
        };

        thumb.appendChild(image);
        imageInfo.appendChild(thumb);

        const info = document.createElement("div");
        info.appendChild(makeElement("div", "file-cell-name", `${record.fileName}`));
        info.appendChild(makeElement("div", "muted", result.key || "Processed S3 object"));

        imageInfo.appendChild(info);
        imageCell.appendChild(imageInfo);
        row.appendChild(imageCell);

        row.appendChild(makeElement("td", "", VARIANT_LABELS[variant]));

        const dimensionCell = makeElement("td", "muted", "Loading dimensions…");
        row.appendChild(dimensionCell);

        image.addEventListener("load", () => {
            dimensionCell.textContent =
                `${image.naturalWidth} × ${image.naturalHeight} px`;
            dimensionCell.classList.remove("muted");
        });

        row.appendChild(makeElement("td", "", formatDate(record.uploadedAt)));

        const actionCell = document.createElement("td");
        const downloadButton = makeElement("button", "secondary-button", "Download");
        downloadButton.type = "button";

        downloadButton.addEventListener("click", () => {
            const extension = record.fileName.toLowerCase().endsWith(".png")
                ? ".png"
                : ".jpg";
            const baseName = record.fileName.replace(/\.[^.]+$/, "");

            downloadResult(
                result,
                `${baseName}-${variant}${extension}`
            );
        });

        actionCell.appendChild(downloadButton);
        row.appendChild(actionCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}

function renderStorageIfVisible() {
    if (currentPage === "storage") {
        renderStorage();
    }
}

document.getElementById("refreshStorageButton").addEventListener(
    "click",
    renderStorage
);

/* -------------------------
   Initial state
------------------------- */

resetOutputCards();
showStatus("Select or drop an image to begin.");
navigateTo("studio");