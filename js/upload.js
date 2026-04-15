// upload.js – File upload helper with preview
async function uploadFile(file, type = 'image') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  const res = await fetch('http://localhost:3000/api/v1/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Upload failed');
  }
  return res.json();
}

function createFileUploader(options = {}) {
  const { onUpload, accept = 'image/*', previewId } = options;

  const container = document.createElement('div');
  container.className = 'file-uploader';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'adm-btn';
  button.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Browse Device';
  button.addEventListener('click', () => input.click());

  const preview = document.createElement('img');
  preview.id = previewId || 'uploadPreview';
  preview.style.maxWidth = '200px';
  preview.style.maxHeight = '200px';
  preview.style.display = 'none';
  preview.style.marginTop = '10px';
  preview.style.borderRadius = '8px';

  let currentUrl = '';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    preview.src = localUrl;
    preview.style.display = 'block';

    try {
      const result = await uploadFile(file);
      currentUrl = result.url;
      if (onUpload) onUpload(result.url);
      if (window.showToast) window.showToast('Upload successful', 'ok');
    } catch (err) {
      if (window.showToast) window.showToast('Upload failed: ' + err.message, 'err');
      preview.style.display = 'none';
    }
  });

  container.appendChild(button);
  container.appendChild(input);
  container.appendChild(preview);

  return {
    container,
    getUrl: () => currentUrl,
    setUrl: (url) => {
      currentUrl = url;
      if (url) {
        preview.src = url;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }
  };
}

window.uploadFile = uploadFile;
window.createFileUploader = createFileUploader;