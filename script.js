const canvas = document.getElementById('collageCanvas');
    const ctx = canvas.getContext('2d', {
      alpha: false,  // no transparency for better performance
      willReadFrequently: false  // optimize for drawing operations
    });

    // disable image smoothing for crisp rendering at exact pixels
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';  // use highest quality smoothing

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const imageList = document.getElementById('imageList');
    const sizeSelect = document.getElementById('sizeSelect');
    const slidesNav = document.getElementById('slidesNav');

    // State
    let slides = [{
      id: Date.now(),
      layout: 'vertical',
      images: [] // { img: ImageElement, id: number, selected: boolean, crop: { x, y, zoom } }
    }];
    let currentSlideIndex = 0;

    let jpegQuality = 0.97; // quality slider value (0.95 to 1.00), default 97%
    let DISPLAY_SCALE = 0.5;

    // Helper to get current slide
    function getCurrentSlide() {
      return slides[currentSlideIndex];
    }

    // Canvas size configurations
    const sizes = {
      square: { width: 1080, height: 1080 },
      portrait: { width: 1080, height: 1350 },
      landscape: { width: 1080, height: 566 },
      story: { width: 1080, height: 1920 },
      youtube: { width: 1280, height: 720 }
    };

    // Initialize canvas
    function initCanvas() {
      const size = sizes[sizeSelect.value];
      canvas.width = size.width;
      canvas.height = size.height;

      // Calculate responsive display scale based on viewport and canvas size
      // Make canvas much bigger - use more of the available space
      const container = document.querySelector('.canvas-container');
      const maxDisplayWidth = container.clientWidth - 80; // account for padding
      const maxDisplayHeight = container.clientHeight - 80;

      const scaleX = maxDisplayWidth / size.width;
      const scaleY = maxDisplayHeight / size.height;
      DISPLAY_SCALE = Math.min(scaleX, scaleY, 1.2); // allow up to 1.2x for better visibility

      canvas.style.width = (size.width * DISPLAY_SCALE) + 'px';
      canvas.style.height = (size.height * DISPLAY_SCALE) + 'px';

      // ensure high quality rendering after canvas resize
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

 
    function handleSizeChange() {
      initCanvas();
      updateOutputStats();
      if (getCurrentSlide().images.length > 0) {
        createCollage();
      }
    }

    // Layout button highlighting
    function setLayout(layout) {
      saveCurrentSlideState();

      const slide = getCurrentSlide();
      slide.layout = layout;

      // 🔥 Reset random layout when user chooses manually
      slide._randomLayout = null;

      document.querySelectorAll('.layout-btn').forEach(btn => {
        btn.classList.remove('active');
      });

      event.target.classList.add('active');

      updateOutputStats();

      if (slide.images.length > 0) {
        createCollage();
      }

      renderSlideNav();
    }

    function downloadAtCurrentQuality() {
      downloadCollage();
    }

    // ultra-granular slider mapping: 0-100 slider maps to 95-100% quality
    // massive precision at 99-100% where file size explodes
    function mapSliderToQuality(sliderValue) {
      // slider: 0-100 (100 steps total)
      // map to quality: 95-100% (5% range)
      // 
      // Distribution:
      // 0-40: 95-98% (3% across 40 steps = 0.075% per step)
      // 40-60: 98-99% (1% across 20 steps = 0.05% per step)
      // 60-100: 99-100% (1% across 40 steps = 0.025% per step) <- HUGE granularity here!

      if (sliderValue <= 40) {
        // 95-98% range
        return 95 + (sliderValue * 0.075);
      } else if (sliderValue <= 60) {
        // 98-99% range
        return 98 + ((sliderValue - 40) * 0.05);
      } else {
        // 99-100% range with maximum precision
        return 99 + ((sliderValue - 60) * 0.025);
      }
    }

    function updateQualityDisplayNonLinear(sliderValue) {
      const quality = mapSliderToQuality(parseInt(sliderValue));
      jpegQuality = quality / 100;

      // update quality display with two decimals for ultra precision
      const displayQuality = quality === 100 ? '100.00' : quality.toFixed(2);
      document.getElementById('qualityDisplay').textContent = displayQuality + '%';

      // calculate and display estimated file size based on current canvas size
      const size = sizes[sizeSelect.value];
      const totalPixels = size.width * size.height;

      // refined estimation for 95-100% range
      // 95%: 0.50, 97%: 0.60, 98%: 0.70, 99%: 0.85, 100%: 1.0 bytes per pixel
      let bytesPerPixel;
      if (quality < 97) {
        bytesPerPixel = 0.50 + ((quality - 95) / 2) * 0.10;
      } else if (quality < 98) {
        bytesPerPixel = 0.60 + ((quality - 97) / 1) * 0.10;
      } else if (quality < 99) {
        bytesPerPixel = 0.70 + ((quality - 98) / 1) * 0.15;
      } else if (quality < 100) {
        bytesPerPixel = 0.85 + ((quality - 99) / 1) * 0.15;
      } else {
        bytesPerPixel = 1.0; // 100% quality
      }

      const estimatedBytes = totalPixels * bytesPerPixel;
      const sizeDisplay = formatFileSize(estimatedBytes);
      document.getElementById('qualitySizeDisplay').textContent = '~' + sizeDisplay;
    }

    function clearAll() {
      // Clear all frames
      const existingFrames = document.querySelectorAll('.frame');
      existingFrames.forEach(frame => frame.remove());

      // Clear uploaded images array and image list
      getCurrentSlide().images = [];
      imageList.innerHTML = '';

      // Ensure the imageList is hidden
      imageList.style.display = 'none';

      // update output stats
      updateOutputStats();

      // Reinitialize canvas with white background
      initCanvas();
      updateButtonStates();
      renderSlideNav();
    }

    function updateButtonStates() {
      const clearBtn = document.querySelector('.action-btn.clear');
      const downloadBtn = document.querySelector('.action-btn.download');
      const downloadAllBtn = document.getElementById('downloadAllBtn');

      const currentImages = getCurrentSlide().images;
      const hasImages = currentImages && currentImages.length > 0;
      const hasContent = slides.some(s => s.images.length > 0);

      if (clearBtn) {
        clearBtn.disabled = !hasImages;
      }

      if (downloadBtn) {
        downloadBtn.disabled = !hasImages;
      }

      if (downloadAllBtn) {
        downloadAllBtn.disabled = !hasContent;
      }
    }

    // Handle file upload
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFiles);

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      handleFiles({ target: { files: e.dataTransfer.files } });
    });

    function handleFiles(e) {
      const files = Array.from(e.target.files);
      let loadedImages = 0;
      const currentSlide = getCurrentSlide();
      
  

      files.forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
              currentSlide.images.push({
                img: img,
                id: Date.now() + Math.random(),
                selected: false,
                crop: null
              });

              loadedImages++;
              updateImageList();
              updateOutputStats();
              updateButtonStates();

              if (loadedImages === files.length) {
                createCollage();
                renderSlideNav();
              }
            };
          };
          reader.readAsDataURL(file);
        }
      });

      // Reset file input
      fileInput.value = '';
    }

    function updateImageList() {
      imageList.innerHTML = '';
      const currentImages = getCurrentSlide().images;

      // Hide imageList if there are no images
      if (currentImages.length === 0) {
        imageList.style.display = 'none';
        return;
      }

      // Show imageList and update its contents
      imageList.style.display = 'flex';
      currentImages.forEach((imgObj, index) => {
        const container = document.createElement('div');
        container.classList.add('thumbnail-container');
        container.setAttribute('draggable', 'true');

        // Add drag event listeners
        container.addEventListener('dragstart', (e) => dragStart(e, index));
        container.addEventListener('dragover', (e) => dragOver(e));
        container.addEventListener('dragleave', (e) => dragLeave(e));
        container.addEventListener('drop', (e) => drop(e, index));

        const thumbnail = document.createElement('img');
        thumbnail.src = imgObj.img.src;
        thumbnail.classList.add('thumbnail');
        if (imgObj.selected) {
          thumbnail.classList.add('selected');
        }

        thumbnail.onclick = () => {
          toggleImageSelection(index);
          createCollage();
        };

        const deleteIcon = document.createElement('div');
        deleteIcon.classList.add('delete-icon');
        deleteIcon.innerHTML = '×';
        deleteIcon.onclick = (e) => {
          e.stopPropagation();
          currentImages.splice(index, 1);
          updateImageList();
          createCollage();
          renderSlideNav();
        };

        container.appendChild(thumbnail);
        container.appendChild(deleteIcon);
        imageList.appendChild(container);
      });
    }

    // Drag and Drop Handlers
    let dragSrcIndex = null;

    function dragStart(e, index) {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.target.closest('.thumbnail-container').classList.add('dragging');
    }

    function dragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (dragSrcIndex === null) return; // Should handle external files differently if needed

      const target = e.currentTarget; // The thumbnail-container
      const rect = target.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;

      // Find index of target
      // We can't easily get index from event target directly unless we add it to dataset, 
      // but we passed it to the drop handler closure.
      // For dragOver visual feedback, we need to know if it's left or right.

      target.classList.remove('drag-over-left', 'drag-over-right');

      if (e.clientX < midX) {
        target.classList.add('drag-over-left');
      } else {
        target.classList.add('drag-over-right');
      }
    }

    function dragLeave(e) {
      e.currentTarget.classList.remove('drag-over-left', 'drag-over-right');
    }

    function drop(e, dropIndex) {
      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget;
      target.classList.remove('drag-over-left', 'drag-over-right');

      if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

      const currentImages = getCurrentSlide().images;

      // Determine position based on drop (left or right of target)
      const rect = target.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertAfter = e.clientX > midX;

      // Remove the dragged image
      const [movedImage] = currentImages.splice(dragSrcIndex, 1);

      // Calculate new index
      let newIndex = dropIndex;
      if (dragSrcIndex < dropIndex) {
        newIndex = dropIndex - 1;
      }
      if (insertAfter) {
        newIndex = newIndex + 1;
      }

      // Insert at new position
      currentImages.splice(newIndex, 0, movedImage);

      // Reset the source index
      dragSrcIndex = null;

      // Update the image list and regenerate the collage
      updateImageList();
      createCollage();
      renderSlideNav();
    }

    function toggleImageSelection(index) {
      const currentImages = getCurrentSlide().images;
      currentImages[index].selected = !currentImages[index].selected;
      updateImageList();
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function updateOutputStats() {
      const outputStatsSection = document.getElementById('outputStatsSection');
      const outputStatsGrid = document.getElementById('outputStatsGrid');

      // hide section if no images
      if (getCurrentSlide().images.length === 0) {
        outputStatsSection.classList.remove('visible');
        return;
      }

      // show section and populate data
      outputStatsSection.classList.add('visible');
      outputStatsGrid.innerHTML = '';

      const size = sizes[sizeSelect.value];
      const aspectRatio = (size.width / size.height).toFixed(2);

      // calculate file size based on current quality setting
      const totalPixels = size.width * size.height;
      const quality = jpegQuality * 100;

      // refined estimation for 95-100% range
      let bytesPerPixel;
      if (quality < 97) {
        bytesPerPixel = 0.50 + ((quality - 95) / 2) * 0.10;
      } else if (quality < 98) {
        bytesPerPixel = 0.60 + ((quality - 97) / 1) * 0.10;
      } else if (quality < 99) {
        bytesPerPixel = 0.70 + ((quality - 98) / 1) * 0.15;
      } else if (quality < 100) {
        bytesPerPixel = 0.85 + ((quality - 99) / 1) * 0.15;
      } else {
        bytesPerPixel = 1.0; // 100% quality
      }

      const currentQuality = quality === 100 ? '100' : quality.toFixed(1);

      const estimatedSizeBytes = totalPixels * bytesPerPixel;
      const estimatedSizeFormatted = formatFileSize(estimatedSizeBytes);

      // get current layout info
      const currentLayout = getCurrentSlide().layout;
     const layoutMap = {
        horizontal: 'Side by Side',
        vertical: 'Stacked',
        grid: 'Grid',
        mixed: 'Mixed',
        divide_conquer: 'Divide & Conquer',
        random: 'Random'
      };

      const layoutText = layoutMap[currentLayout] || 'Custom';
      const photoCount = getCurrentSlide().images.length;

      // create stat items
      const dimensionsStat = createOutputStat('Dimensions', `${size.width} × ${size.height}px`);
      const aspectRatioStat = createOutputStat('Aspect Ratio', aspectRatio);
      const layoutStat = createOutputStat('Layout', layoutText);
      const photosStat = createOutputStat('Photos', photoCount.toString(), true);
      const formatStat = createOutputStat('Format', `JPEG (${currentQuality}%)`);
      const estimatedSizeStat = createOutputStat('Est. Size', `~${estimatedSizeFormatted}`);

      outputStatsGrid.appendChild(dimensionsStat);
      outputStatsGrid.appendChild(aspectRatioStat);
      outputStatsGrid.appendChild(layoutStat);
      outputStatsGrid.appendChild(photosStat);
      outputStatsGrid.appendChild(formatStat);
      outputStatsGrid.appendChild(estimatedSizeStat);
    }

    function createOutputStat(label, value, highlight = false) {
      const item = document.createElement('div');
      item.className = 'output-stat-item';

      const labelSpan = document.createElement('div');
      labelSpan.className = 'output-stat-label';
      labelSpan.textContent = label;

      const valueSpan = document.createElement('div');
      valueSpan.className = 'output-stat-value' + (highlight ? ' highlight' : '');
      valueSpan.textContent = value;

      item.appendChild(labelSpan);
      item.appendChild(valueSpan);

      return item;
    }
    function createCollage() {
      initCanvas();
      const currentSlide = getCurrentSlide();
      const images = currentSlide.images;

      const selectedImages = images.filter(img => img.selected);
      const imagesToUse = selectedImages.length > 0 ? selectedImages : images;

      // Clear frames
      document.querySelectorAll('.frame').forEach(f => f.remove());

 
      currentSlide._randomLayout = null;
      

      const layout =
        currentSlide.layout === 'random'
          ? currentSlide._randomLayout
          : currentSlide.layout;

      // 🎯 Apply layout
      switch (layout) {
        case 'horizontal':
          createHorizontalLayout(imagesToUse);
          break;

        case 'vertical':
          createVerticalLayout(imagesToUse);
          break;

        case 'grid':
          createGridLayout(imagesToUse);
          break;

        case 'mixed':
          createMixedLayout(imagesToUse);
          break;

        case 'divide_conquer':
          createDivideAndConquerLayout(imagesToUse);
          break;
      }
    }

    function createFrame(x, y, width, height, imgObj) {
      const img = imgObj.img;
      const canvasContainer = document.querySelector('.canvas-container');

      // Calculate the offset of the canvas within the container
      const canvasOffsetX = canvas.offsetLeft;
      const canvasOffsetY = canvas.offsetTop;

      const frame = document.createElement('div');
      frame.className = 'frame';

      // Add the canvas offset to the frame position
      frame.style.left = (x * DISPLAY_SCALE + canvasOffsetX) + 'px';
      frame.style.top = (y * DISPLAY_SCALE + canvasOffsetY) + 'px';
      frame.style.width = (width * DISPLAY_SCALE) + 'px';
      frame.style.height = (height * DISPLAY_SCALE) + 'px';

      // Create and add image
      const imgElement = document.createElement('img');
      imgElement.src = img.src;
      frame.appendChild(imgElement);

      // Create crop controls
      const cropControls = document.createElement('div');
      cropControls.className = 'crop-controls';

      const zoomInBtn = document.createElement('div');
      zoomInBtn.className = 'crop-btn';
      zoomInBtn.innerHTML = '+';
      zoomInBtn.title = 'Zoom In';

      const zoomOutBtn = document.createElement('div');
      zoomOutBtn.className = 'crop-btn';
      zoomOutBtn.innerHTML = '−';
      zoomOutBtn.title = 'Zoom Out';

      const resetBtn = document.createElement('div');
      resetBtn.className = 'crop-btn';
      resetBtn.innerHTML = '⌂';
      resetBtn.title = 'Reset Position & Zoom';

      cropControls.appendChild(zoomInBtn);
      cropControls.appendChild(zoomOutBtn);
      cropControls.appendChild(resetBtn);
      frame.appendChild(cropControls);

      // Create zoom indicator
      const zoomIndicator = document.createElement('div');
      zoomIndicator.className = 'zoom-indicator';
      zoomIndicator.textContent = '100%';
      frame.appendChild(zoomIndicator);

      // Initialize image properties
      // Use saved crop state or default
      let currentZoom = imgObj.crop ? imgObj.crop.zoom : 1;
      const aspectRatio = img.width / img.height;
      let baseImgWidth, baseImgHeight;

      // Calculate base image size (fit to cover the frame)
      if (width / height > aspectRatio) {
        baseImgWidth = width * DISPLAY_SCALE;
        baseImgHeight = (width / aspectRatio) * DISPLAY_SCALE;
      } else {
        baseImgHeight = height * DISPLAY_SCALE;
        baseImgWidth = (height * aspectRatio) * DISPLAY_SCALE;
      }

      function updateCropState() {
        imgObj.crop = {
          zoom: currentZoom,
          x: parseFloat(imgElement.style.left) || 0,
          y: parseFloat(imgElement.style.top) || 0
        };
      }

      function updateImageDisplay() {
        const scaledWidth = baseImgWidth * currentZoom;
        const scaledHeight = baseImgHeight * currentZoom;

        imgElement.style.width = scaledWidth + 'px';
        imgElement.style.height = scaledHeight + 'px';

        // Update zoom indicator
        zoomIndicator.textContent = Math.round(currentZoom * 100) + '%';

        // Constrain position after zoom change
        constrainImagePosition();
        updateCropState();
      }

      function constrainImagePosition() {
        const scaledWidth = baseImgWidth * currentZoom;
        const scaledHeight = baseImgHeight * currentZoom;
        const frameWidth = width * DISPLAY_SCALE;
        const frameHeight = height * DISPLAY_SCALE;

        let currentX = parseFloat(imgElement.style.left) || 0;
        let currentY = parseFloat(imgElement.style.top) || 0;

        // Limit dragging bounds
        const minX = frameWidth - scaledWidth;
        const minY = frameHeight - scaledHeight;

        currentX = Math.min(0, Math.max(minX, currentX));
        currentY = Math.min(0, Math.max(minY, currentY));

        imgElement.style.left = currentX + 'px';
        imgElement.style.top = currentY + 'px';
      }

      function resetImagePosition() {
        currentZoom = 1;
        imgElement.style.left = ((width * DISPLAY_SCALE) - baseImgWidth) / 2 + 'px';
        imgElement.style.top = ((height * DISPLAY_SCALE) - baseImgHeight) / 2 + 'px';
        updateImageDisplay();
      }

      // Initialize image
      if (imgObj.crop) {
        imgElement.style.left = imgObj.crop.x + 'px';
        imgElement.style.top = imgObj.crop.y + 'px';
        updateImageDisplay();
      } else {
        resetImagePosition();
      }

      // Zoom controls
      zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentZoom = Math.min(currentZoom * 1.2, 5); // Max 5x zoom
        updateImageDisplay();
      });

      zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentZoom = Math.max(currentZoom / 1.2, 0.5); // Min 0.5x zoom
        updateImageDisplay();
      });

      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetImagePosition();
      });

      // Drag functionality
      let isDragging = false;
      let startX, startY, initialImgX, initialImgY;

      frame.addEventListener('mousedown', (e) => {
        // Don't start dragging if clicking on controls
        if (e.target.closest('.crop-controls')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialImgX = parseFloat(imgElement.style.left);
        initialImgY = parseFloat(imgElement.style.top);
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newX = initialImgX + dx;
        let newY = initialImgY + dy;

        // Apply constraints
        const scaledWidth = baseImgWidth * currentZoom;
        const scaledHeight = baseImgHeight * currentZoom;
        const frameWidth = width * DISPLAY_SCALE;
        const frameHeight = height * DISPLAY_SCALE;

        const minX = frameWidth - scaledWidth;
        const minY = frameHeight - scaledHeight;

        newX = Math.min(0, Math.max(minX, newX));
        newY = Math.min(0, Math.max(minY, newY));

        imgElement.style.left = newX + 'px';
        imgElement.style.top = newY + 'px';

        updateCropState(); // Update state during drag (or at least after)
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          updateCropState(); // Ensure final state is saved
        }
      });

      // Store zoom info on frame for download function
      frame._imageData = {
        zoom: () => currentZoom,
        baseWidth: () => baseImgWidth,
        baseHeight: () => baseImgHeight
      };

      canvasContainer.appendChild(frame);
    }

    function createHorizontalLayout(images) {
      if (images.length === 0) return;

      const width = canvas.width / images.length;
      images.forEach((img, i) => {
        createFrame(
          i * width,
          0,
          width,
          canvas.height,
          img
        );
      });
    }

    function createVerticalLayout(images) {
      if (images.length === 0) return;

      const height = canvas.height / images.length;
      images.forEach((img, i) => {
        createFrame(
          0,
          i * height,
          canvas.width,
          height,
          img
        );
      });
    }

    function createGridLayout(images) {
      if (images.length === 0) return;

      const cols = Math.ceil(Math.sqrt(images.length)); // auto columns
      const rows = Math.ceil(images.length / cols);

      const frameWidth = canvas.width / cols;
      const frameHeight = canvas.height / rows;

      images.forEach((img, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        createFrame(
          col * frameWidth,
          row * frameHeight,
          frameWidth,
          frameHeight,
          img
        );
      });
    }
    function createMixedLayout(images) {
      if (images.length === 0) return;

      // First image big
      createFrame(0, 0, canvas.width * 0.6, canvas.height, images[0]);

      const remaining = images.slice(1);
      const smallHeight = canvas.height / remaining.length;

      remaining.forEach((img, i) => {
        createFrame(
          canvas.width * 0.6,
          i * smallHeight,
          canvas.width * 0.4,
          smallHeight,
          img
        );
      });
    }
    function createDivideAndConquerLayout(images) {
  if (images.length === 0) return;

  // 🔥 Shuffle for randomness
  images = [...images].sort(() => Math.random() - 0.5);

  function sliceRect(x, y, w, h, imgSubset) {
    if (imgSubset.length === 1) {
      createFrame(x, y, w, h, imgSubset[0]);
      return;
    }

    // 🚫 Avoid tiny boxes
    if (w < 150 || h < 150) {
      createFrame(x, y, w, h, imgSubset[0]);
      return;
    }

    const half = Math.floor(imgSubset.length / 2);
    const firstHalf = imgSubset.slice(0, half);
    const secondHalf = imgSubset.slice(half);

    // 🎯 Better ratio randomness
    const ratio = 0.4 + Math.random() * 0.2;

    // 🔀 Random split direction
    const splitVertical = Math.random() > 0.5;

    if (splitVertical) {
      const splitW = w * ratio;
      sliceRect(x, y, splitW, h, firstHalf);
      sliceRect(x + splitW, y, w - splitW, h, secondHalf);
    } else {
      const splitH = h * ratio;
      sliceRect(x, y, w, splitH, firstHalf);
      sliceRect(x, y + splitH, w, h - splitH, secondHalf);
    }
  }

  sliceRect(0, 0, canvas.width, canvas.height, images);
}
    function renderCanvas() {
      const frames = document.querySelectorAll('.frame');
      initCanvas();

      // ensure high quality rendering for export
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      frames.forEach(frame => {
        const img = frame.querySelector('img');

        // get the canvas offset that we used for display
        const canvasOffsetX = canvas.offsetLeft;
        const canvasOffsetY = canvas.offsetTop;

        // get frame position relative to canvas by removing the offset
        const frameX = (parseFloat(frame.style.left) - canvasOffsetX) / DISPLAY_SCALE;
        const frameY = (parseFloat(frame.style.top) - canvasOffsetY) / DISPLAY_SCALE;
        const frameWidth = parseFloat(frame.style.width) / DISPLAY_SCALE;
        const frameHeight = parseFloat(frame.style.height) / DISPLAY_SCALE;

        // get the actual image position within the frame
        const imgX = parseFloat(img.style.left) / DISPLAY_SCALE;
        const imgY = parseFloat(img.style.top) / DISPLAY_SCALE;
        const imgWidth = parseFloat(img.style.width) / DISPLAY_SCALE;
        const imgHeight = parseFloat(img.style.height) / DISPLAY_SCALE;

        // create a clipping path for the frame
        ctx.save();
        ctx.beginPath();
        ctx.rect(frameX, frameY, frameWidth, frameHeight);
        ctx.clip();

        // draw the image at the correct position
        ctx.drawImage(
          img,
          frameX + imgX,
          frameY + imgY,
          imgWidth,
          imgHeight
        );

        ctx.restore();
      });
    }

    function downloadCollage() {
      renderCanvas();

      const link = document.createElement('a');

      link.download = 'collage.jpg';
      // JPEG with user-selected quality from slider
      // Quality range: 80-100% (0.80-1.00)
      // Instagram best practice: keep under 1MB to avoid aggressive compression
      link.href = canvas.toDataURL('image/jpeg', jpegQuality);

      link.click();
    }

    async function downloadAllSlides() {
      const btn = document.getElementById('downloadAllBtn');
      const originalText = btn.innerText;
      btn.innerText = '⏳ Zipping...';
      btn.disabled = true;

      try {
        // Check if JSZip is loaded
        if (typeof JSZip === 'undefined') {
          throw new Error('JSZip library not loaded');
        }

        const zip = new JSZip();
        const originalIndex = currentSlideIndex;

        // Iterate through all slides
        for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          if (slide.images.length === 0) continue;

          // Switch context to this slide
          currentSlideIndex = i;

          // Render the slide to DOM frames
          createCollage();

          // Draw DOM frames to canvas
          renderCanvas();

          // Capture canvas to blob
          const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', jpegQuality);
          });

          zip.file(`slide-${i + 1}.jpg`, blob);
        }

        // Generate zip file
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);

        const link = document.createElement('a');
        link.download = 'instagram-carousel.zip';
        link.href = url;
        link.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        // Restore original state
        currentSlideIndex = originalIndex;
        switchSlide(originalIndex);

      } catch (err) {
        console.error('Zip creation failed:', err);
        alert('Failed to create zip: ' + err.message);
      } finally {
        btn.innerText = originalText;
        btn.disabled = false;
      }
    }

    async function optimizeForInstagram() {
      const btn = document.getElementById('optimizeBtn');
      const originalText = btn.innerHTML;
      const originalPointerEvents = btn.style.pointerEvents;

      btn.innerHTML = '⏳ Optimizing...';
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.8';

      // wait a tick to let UI update
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        renderCanvas();

        const MAX_SIZE_BYTES = 1024 * 1024; // 1MB
        // we aim for slightly less to be safe
        const TARGET_BYTES = 990 * 1024;

        let minQ = 0.5;
        let maxQ = 1.0;
        let bestBlob = null;
        let bestQuality = 0;

        // helper to get blob size at quality
        const getBlobSize = async (q) => {
          return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', q);
          });
        };

        // binary search for the highest quality < 1MB
        // increased iterations for precision
        for (let i = 0; i < 12; i++) {
          const midQ = (minQ + maxQ) / 2;
          const blob = await getBlobSize(midQ);

          if (blob.size > TARGET_BYTES) {
            // too big, need lower quality
            maxQ = midQ;
          } else {
            // fits! try to get better quality
            bestBlob = blob;
            bestQuality = midQ;
            minQ = midQ;
          }
        }

        // verify we have a valid blob
        if (!bestBlob) {
          // fallback: if even 0.5 is too big (unlikely), just take 0.5
          bestBlob = await getBlobSize(0.5);
        }

        // download the optimized blob
        const url = URL.createObjectURL(bestBlob);
        const link = document.createElement('a');
        link.download = 'collage.jpg';
        link.href = url;
        link.click();

        // cleanup
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error('Optimization failed:', err);
        alert('Something went wrong while optimizing. Please try the manual download.');
      } finally {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = originalPointerEvents;
        btn.style.opacity = '1';
      }
    }

    // Initialize
    initCanvas();
    imageList.style.display = 'none';
    renderSlideNav(); // Initial render

    // Call updateButtonStates on initial load
    document.addEventListener('DOMContentLoaded', () => {
      updateButtonStates();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      if (getCurrentSlide() && getCurrentSlide().images.length > 0) {
        createCollage();
      } else {
        initCanvas();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Ignore if input or textarea is focused
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft') {
        if (currentSlideIndex > 0) {
          switchSlide(currentSlideIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentSlideIndex < slides.length - 1) {
          switchSlide(currentSlideIndex + 1);
        }
      }
    });

    // --- Slide Management ---

    function saveCurrentSlideState() {
      // State is updated live via imgObj reference in createFrame
      // This function is a placeholder for any explicit sync logic if needed later
    }

    function addSlide() {
      slides.push({
        id: Date.now(),
        layout: 'vertical',
        images: []
      });
      // Switch to the new slide (which is empty)
      switchSlide(slides.length - 1);
    }

    function switchSlide(index) {
      if (index < 0 || index >= slides.length) return;

      // Save state of currently active slide before switching away
      // (Not strictly necessary as we update live, but good for future proofing)
      saveCurrentSlideState();

      currentSlideIndex = index;
      const currentSlide = getCurrentSlide();

      // Restore Layout UI
      document.querySelectorAll('.layout-btn').forEach(btn => {
        btn.classList.remove('active');
        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes(`'${currentSlide.layout}'`)) {
          btn.classList.add('active');
        }
      });

      updateImageList();

      // Important: Clear existing frames first
      const existingFrames = document.querySelectorAll('.frame');
      existingFrames.forEach(frame => frame.remove());

      if (currentSlide.images.length > 0) {
        createCollage();
      } else {
        initCanvas(); // clear canvas if empty
      }

      updateOutputStats();
      updateButtonStates();
      renderSlideNav();
    }

    function deleteSlide(index, e) {
      if (e) e.stopPropagation();

      if (slides.length <= 1) {
        alert("Cannot delete the only slide.");
        return;
      }

      if (confirm("Are you sure you want to delete this slide?")) {
        slides.splice(index, 1);

        // Adjust index
        if (currentSlideIndex >= slides.length) {
          currentSlideIndex = slides.length - 1;
        }

        // Always refresh to show new state
        switchSlide(currentSlideIndex);
      }
    }

    function renderSlideNav() {
      const container = document.getElementById('slidesNav');
      const addBtn = container.querySelector('.add-slide-btn');

      // Clear existing slides (keep add button)
      const existingSlides = container.querySelectorAll('.slide-thumb');
      existingSlides.forEach(el => el.remove());

      slides.forEach((slide, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'slide-thumb';
        if (index === currentSlideIndex) thumb.classList.add('active');

        // Add draggable attributes for slides
        thumb.setAttribute('draggable', 'true');

        thumb.onclick = () => switchSlide(index);

        // Drag events for slides
        thumb.addEventListener('dragstart', (e) => handleSlideDragStart(e, index));
        thumb.addEventListener('dragover', (e) => handleSlideDragOver(e, index));
        thumb.addEventListener('dragleave', (e) => handleSlideDragLeave(e));
        thumb.addEventListener('drop', (e) => handleSlideDrop(e, index));
        thumb.addEventListener('dragend', (e) => handleSlideDragEnd(e));

        // Number
        const num = document.createElement('div');
        num.className = 'slide-thumb-number';
        num.textContent = index + 1;
        thumb.appendChild(num);

        // Delete button
        const del = document.createElement('div');
        del.className = 'slide-delete';
        del.innerHTML = '×';
        del.onclick = (e) => deleteSlide(index, e);
        thumb.appendChild(del);

        // Preview
        if (slide.images.length > 0) {
          const img = document.createElement('img');
          img.className = 'slide-thumb-preview';
          img.src = slide.images[0].img.src;
          img.style.display = 'block';
          thumb.appendChild(img);
        } else {
          thumb.textContent = 'Empty';
          thumb.appendChild(num); // Re-append num since textContent cleared it
          thumb.appendChild(del);
        }

        container.insertBefore(thumb, addBtn);
      });
    }
    // Slide Drag and Drop Handlers
    let dragSlideIndex = null;
    let activeSlideId = null; // To track active slide across reorders

    function handleSlideDragStart(e, index) {
      dragSlideIndex = index;
      activeSlideId = slides[currentSlideIndex].id; // Remember which one was active
      e.dataTransfer.effectAllowed = 'move';
      e.target.classList.add('dragging');
    }

    function handleSlideDragOver(e, index) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (dragSlideIndex === null || dragSlideIndex === index) return;

      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;

      target.classList.remove('drag-over-left', 'drag-over-right');

      if (e.clientX < midX) {
        target.classList.add('drag-over-left');
      } else {
        target.classList.add('drag-over-right');
      }
    }

    function handleSlideDragLeave(e) {
      e.currentTarget.classList.remove('drag-over-left', 'drag-over-right');
    }

    function handleSlideDrop(e, dropIndex) {
      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget;
      target.classList.remove('drag-over-left', 'drag-over-right', 'dragging');

      if (dragSlideIndex === null || dragSlideIndex === dropIndex) return;

      const rect = target.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertAfter = e.clientX > midX;

      // Remove dragged slide
      const [movedSlide] = slides.splice(dragSlideIndex, 1);

      // Calculate new insertion index
      let newIndex = dropIndex;
      if (dragSlideIndex < dropIndex) {
        newIndex = dropIndex - 1;
      }
      if (insertAfter) {
        newIndex = newIndex + 1;
      }

      slides.splice(newIndex, 0, movedSlide);

      // Restore active slide index
      currentSlideIndex = slides.findIndex(s => s.id === activeSlideId);

      renderSlideNav();
      updateOutputStats(); // In case numbering changed things in stats? (no, but good practice)
    }

    function handleSlideDragEnd(e) {
      e.target.classList.remove('dragging');
      document.querySelectorAll('.slide-thumb').forEach(el => {
        el.classList.remove('drag-over-left', 'drag-over-right');
      });
      dragSlideIndex = null;
    }
