import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, Renderer2 } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';


@Component({
  selector: 'app-auro-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './auro-editor.component.html',
  styleUrls: ['./auro-editor.component.css']
})
export class AuroEditorComponent implements OnInit, AfterViewInit {
  @ViewChild('editorContainer') editorContainer!: ElementRef;
  @ViewChild('canvasContent') canvasContent!: ElementRef;
  @ViewChild('colorInput') colorInput!: ElementRef;
  @ViewChild('imageModal') imageModal!: ElementRef;
  @ViewChild('tableModal') tableModal!: ElementRef;
  @ViewChild('imageFileInput') imageFileInput!: ElementRef;
  
  // Canvas state
  zoom = 100;
  cursorPosition = { x: 0, y: 0 };
  
  // Text formatting state
  currentFontFamily = 'Inter';
  currentFontSize = '18';
  currentColor = '#000000';
  isBold = false;
  isItalic = false;
  isUnderlined = false;
  currentAlignment = 'left';
  selection: Selection | null = null;
  range: Range | null = null;
  
  // UI state
  showTextControls = true;
  
  // Undo/Redo history
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  
  // Export options
  exportFormat = 'html';
  exportDetails = '';
  showExportModal = false;
  
  // Notification
  notification = '';
  notificationType: 'success' | 'warning' | 'error' = 'success';
  showNotification = false;

  // Image and Table properties
  imageModalOpen = false;
  tableModalOpen = false;
  rotationAngle = 0;
  selectedElement: HTMLElement | null = null;
  tableRows = 3;
  tableCols = 3;
  tableBorderStyle = 'solid';
  tableBorderColor = '#ced4da';

  documentForm!: FormGroup;
  
  constructor(private fb: FormBuilder, private http: HttpClient, private renderer: Renderer2) { }

  ngOnInit(): void {
    // Initialize with an empty page
    this.documentForm = this.fb.group({
      purpose: ['purpose1', Validators.required],
      name: ['', Validators.required],
      formNumber: ['', Validators.required],
      language: ['english', Validators.required],
      pagelayout: ['portrait', Validators.required],
      paperSize: ['', Validators.required],
      marginTop: [1.27, Validators.required],
      marginBottom: [1.27, Validators.required],
      marginLeft: [1.27, Validators.required],
      marginRight: [1.27, Validators.required],
      content: ['']
    });
  }

  ngAfterViewInit(): void {
    this.setupEditor();
    this.saveToHistory(); // Save initial state
  }
  
  onSubmit(): void {
    if (this.documentForm.valid) {
      const editorHtmlContent = this.canvasContent.nativeElement.innerHTML;
      this.documentForm.patchValue({ content: editorHtmlContent });

      let finalData = {
        ...this.documentForm.value, 
        isactive: true,
      };
      
      console.log('Final Submission Data:', finalData);
      this.http.post('https://localhost:7092/api/forms', finalData)
      .subscribe({
        next: (response) => {
          console.log('API Success:', response);
          alert('Submitted Successfully!');
        },
        error: (error) => {
          console.error('API Error:', error);
          alert('Failed to Submit!');
        }
      });
    } else {
      console.error('Form is invalid');
    }
  }

  // ====== EDITOR SETUP ======
  
  setupEditor(): void {
    if (this.canvasContent && this.canvasContent.nativeElement) {
      // Make canvas content editable
      this.renderer.setAttribute(this.canvasContent.nativeElement, 'contenteditable', 'true');
      
      // Set initial content if empty
      if (!this.canvasContent.nativeElement.innerHTML.trim()) {
        this.canvasContent.nativeElement.innerHTML = '<p>Start typing here...</p>';
      }
      
      // Focus on the canvas
      this.canvasContent.nativeElement.focus();
      
      // Select all text to make it easy to start typing
      document.execCommand('selectAll');
    }
    
    // Track selection changes
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }
  
  handleSelectionChange = (): void => {
    this.selection = window.getSelection();
    if (this.selection && this.selection.rangeCount > 0) {
      this.range = this.selection.getRangeAt(0);
      
      // Check if selection is within our editor
      if (this.isSelectionInEditor()) {
        this.updateFormatButtons();
      }
    }
  };
  
  isSelectionInEditor(): boolean {
    if (!this.selection || !this.canvasContent) return false;
    
    return this.canvasContent.nativeElement.contains(
      this.selection.anchorNode?.parentElement || this.selection.anchorNode
    );
  }
  
  updateFormatButtons(): void {
    if (!this.selection) return;
    
    // Get the parent element of the current selection
    const parentEl = this.selection.anchorNode?.parentElement;
    if (!parentEl) return;
    
    // Check current formatting
    this.isBold = document.queryCommandState('bold');
    this.isItalic = document.queryCommandState('italic');
    this.isUnderlined = document.queryCommandState('underline');
    
    // Check alignment
    if (parentEl.style.textAlign === 'center') {
      this.currentAlignment = 'center';
    } else if (parentEl.style.textAlign === 'right') {
      this.currentAlignment = 'right';
    } else if (parentEl.style.textAlign === 'justify') {
      this.currentAlignment = 'justify';
    } else {
      this.currentAlignment = 'left';
    }
    
    // Check font family
    const fontFamily = window.getComputedStyle(parentEl).fontFamily;
    if (fontFamily) {
      // Extract font name from the computed style (which might include fallbacks)
      const fonts = fontFamily.split(',');
      if (fonts.length > 0) {
        const primaryFont = fonts[0].trim().replace(/["']/g, '');
        this.currentFontFamily = primaryFont;
      }
    }
    
    // Check font size
    const fontSize = window.getComputedStyle(parentEl).fontSize;
    if (fontSize) {
      this.currentFontSize = fontSize.replace('px', '');
    }
    
    // Check color
    const color = window.getComputedStyle(parentEl).color;
    if (color) {
      // Convert RGB to HEX
      this.currentColor = this.rgbToHex(color);
    }
  }
  
  rgbToHex(rgb: string): string {
    // Check if already hex format
    if (rgb.startsWith('#')) return rgb;
    
    // Convert "rgb(r, g, b)" to hex
    const rgbMatch = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!rgbMatch) return '#000000';
    
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // ====== TEXT FORMATTING ======
  
  applyTextFormatting(command: string, value: string = ''): void {
    // Make sure we have focus and selection before applying command
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    // Save state for undo before applying formatting
    this.saveToHistory();
    
    // Execute formatting command
    document.execCommand(command, false, value);
    
    // Update formatting controls to reflect changes
    this.updateFormatButtons();
    
    this.notify(`${command} formatting applied`, 'success');
  }
  
  toggleBold(): void {
    this.applyTextFormatting('bold');
    this.isBold = !this.isBold;
  }
  
  toggleItalic(): void {
    this.applyTextFormatting('italic');
    this.isItalic = !this.isItalic;
  }
  
  toggleUnderline(): void {
    this.applyTextFormatting('underline');
    this.isUnderlined = !this.isUnderlined;
  }
  
  toggleOrderedList(): void {
    this.applyTextFormatting('insertOrderedList');
  }
  
  toggleUnorderedList(): void {
    this.applyTextFormatting('insertUnorderedList');
  }
  
  setColor(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input?.value) return;
    
    this.currentColor = input.value;
    this.applyTextFormatting('foreColor', input.value);
  }
  
  setFontSize(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select?.value) return;
    
    this.currentFontSize = select.value;
    this.applyTextFormatting('fontSize', select.value);
  }
  
  setFontFamily(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select?.value) return;
    
    this.currentFontFamily = select.value;
    this.applyTextFormatting('fontName', select.value);
  }
  
  setAlignment(alignment: 'left' | 'center' | 'right' | 'justify'): void {
    let command = '';
    
    switch(alignment) {
      case 'center':
        command = 'justifyCenter';
        break;
      case 'right':
        command = 'justifyRight';
        break;
      case 'justify':
        command = 'justifyFull';
        break;
      case 'left':
      default:
        command = 'justifyLeft';
        break;
    }
    
    this.applyTextFormatting(command);
    this.currentAlignment = alignment;
  }

  // Indentation methods for multilevel lists
  indent(): void {
    this.applyTextFormatting('indent');
    this.notify('Indentation increased', 'success');
  }

  outdent(): void {
    this.applyTextFormatting('outdent');
    this.notify('Indentation decreased', 'success');
  }

  // ====== HISTORY MANAGEMENT ======
  
  saveToHistory(): void {
    if (!this.canvasContent) return;
    
    // Create a copy of the current state
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.undoStack.push(currentState);
    
    // Clear redo stack when a new action is performed
    this.redoStack = [];
    
    // Limit history size
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }
  }
  
  undo(): void {
    if (this.undoStack.length === 0) {
      this.notify('Nothing to undo', 'warning');
      return;
    }
    
    // Save current state to redo stack
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.redoStack.push(currentState);
    
    // Restore previous state
    const previousState = this.undoStack.pop();
    if (previousState) {
      this.canvasContent.nativeElement.innerHTML = previousState;
      this.notify('Undo successful', 'success');
    }
  }
  
  redo(): void {
    if (this.redoStack.length === 0) {
      this.notify('Nothing to redo', 'warning');
      return;
    }
    
    // Save current state to undo stack
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.undoStack.push(currentState);
    
    // Restore next state
    const nextState = this.redoStack.pop();
    if (nextState) {
      this.canvasContent.nativeElement.innerHTML = nextState;
      this.notify('Redo successful', 'success');
    }
  }

  // ====== KEYBOARD SHORTCUTS ======
  
  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    // Ctrl+Z for undo
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      this.undo();
    }
    
    // Ctrl+Y for redo
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      this.redo();
    }
    
    // Ctrl+B for bold
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      this.toggleBold();
    }
    
    // Ctrl+I for italic
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      this.toggleItalic();
    }
    
    // Ctrl+U for underline
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      this.toggleUnderline();
    }
  }

  // ====== HELPER METHODS ======
  
  adjustZoom(amount: number): void {
    this.zoom = Math.max(10, Math.min(200, this.zoom + amount));
  }
  
  // ====== EXPORT FUNCTIONALITY ======
  
  updateExportDetails(): void {
    switch(this.exportFormat) {
      case 'html':
        this.exportDetails = "HTML format exports the content as a web page viewable in any browser.";
        break;
      case 'txt':
        this.exportDetails = "Plain text format that preserves only the text content.";
        break;
      case 'pdf':
        this.exportDetails = "PDF format for high-quality print documents.";
        break;
    }
  }
  
  downloadExport(): void {
    let data = '';
    let filename = '';
    let mime = '';
    
    try {
      switch(this.exportFormat) {
        case 'html':
          data = this.generateHTML();
          filename = 'document.html';
          mime = 'text/html';
          break;
        case 'txt':
          data = this.canvasContent.nativeElement.innerText;
          filename = 'document.txt';
          mime = 'text/plain';
          break;
        case 'pdf':
          this.notify('PDF export not implemented in this version', 'warning');
          return;
        default:
          this.notify('Invalid export format', 'error');
          return;
      }
      
      // Create download
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showExportModal = false;
      this.notify('Export successful', 'success');
    } catch (error) {
      this.notify('Export failed: ' + (error as Error).message, 'error');
    }
  }
  
  generateHTML(): string {
    // Create basic HTML document
    return `<!DOCTYPE html>
<html>
<head>
  <title>Document Export</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Montserrat:wght@400;500;700&display=swap');
    
    body { 
      margin: 0; 
      padding: 40px; 
      font-family: 'Inter', sans-serif;
    }
    
    .content { 
      width: 794px; 
      margin: 0 auto; 
      background: white; 
      position: relative;
    }
  </style>
</head>
<body>
  <div class="content">
    ${this.canvasContent.nativeElement.innerHTML}
  </div>
</body>
</html>`;
  }
  
  // ====== NOTIFICATION SYSTEM ======
  
  notify(message: string, type: 'success' | 'warning' | 'error'): void {
    this.notification = message;
    this.notificationType = type;
    this.showNotification = true;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.showNotification = false;
    }, 3000);
  }

  // ====== IMAGE HANDLING ======

  // Method to open the image modal
  openImageModal(): void {
    this.imageModalOpen = true;
    // Focus on the modal after it's opened
    setTimeout(() => {
      if (this.imageModal?.nativeElement) {
        this.imageModal.nativeElement.focus();
      }
    }, 100);
  }

  // Method to close the image modal
  closeImageModal(): void {
    this.imageModalOpen = false;
  }

  // Enhanced image insertion with proper resize handlers
  insertImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (!input.files || input.files.length === 0) {
      this.closeImageModal();
      return;
    }
    
    const file = input.files[0];
    
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      this.notify('Please select an image file', 'error');
      return;
    }
    
    // Save current state for undo
    this.saveToHistory();
    
    // Create a FileReader to read the image
    const reader = new FileReader();
    reader.onload = (e) => {
      // Create container div for the image
      const container = document.createElement('div');
      container.className = 'img-container';
      container.contentEditable = 'false';
      
      // Create image element
      const img = document.createElement('img');
      img.src = e.target?.result as string;
      img.className = 'editor-image';
      img.style.width = '300px'; // Initial width
      img.style.maxWidth = '100%';
      img.dataset['rotation'] = '0'; // Store rotation data - Fixed: using bracket notation
      
      // Append image to container
      container.appendChild(img);
      
      // Add resize handles (proper visual elements)
      const corners = ['nw', 'ne', 'sw', 'se'];
      corners.forEach(corner => {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-${corner}`;
        handle.dataset['handle'] = corner; // Fixed: using bracket notation
        container.appendChild(handle);
      });
      
      // Add rotation handle
      const rotateHandle = document.createElement('div');
      rotateHandle.className = 'rotate-handle';
      rotateHandle.innerHTML = '<i class="fas fa-sync-alt"></i>';
      container.appendChild(rotateHandle);
      
      // Focus the editor
      this.canvasContent.nativeElement.focus();
      
      // Insert at current selection point
      if (this.isSelectionInEditor() && this.range) {
        // Create a new paragraph for the image
        const imageParagraph = document.createElement('p');
        imageParagraph.className = 'image-paragraph';
        imageParagraph.appendChild(container);
        
        this.range.deleteContents();
        this.range.insertNode(imageParagraph);
        
        // Move cursor after image paragraph
        this.range.setStartAfter(imageParagraph);
        this.range.setEndAfter(imageParagraph);
        
        if (this.selection) {
          this.selection.removeAllRanges();
          this.selection.addRange(this.range);
        }
      } else {
        // If no selection, append to the end
        const imageParagraph = document.createElement('p');
        imageParagraph.className = 'image-paragraph';
        imageParagraph.appendChild(container);
        this.canvasContent.nativeElement.appendChild(imageParagraph);
      }
      
      // Add event listeners for resize and dragging
      this.setupImageEvents(container, img);
      
      this.notify('Image inserted successfully', 'success');
      this.closeImageModal();
      
      // Reset file input
      input.value = '';
    };
    
    reader.readAsDataURL(file);
  }

  // Set up event listeners for image manipulation
  setupImageEvents(container: HTMLElement, img: HTMLImageElement): void {
    // Double-click to select image
    container.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle selected state
      if (this.selectedElement === container) {
        this.deselectElement();
      } else {
        this.selectElement(container);
      }
    });
    
    // Setup resize functionality
    const resizeHandles = container.querySelectorAll('.resize-handle');
    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', (mouseDownEvent: Event) => {
        const e = mouseDownEvent as MouseEvent; // Fixed: cast to MouseEvent
        e.preventDefault();
        e.stopPropagation();
        
        // Select the element if not already selected
        if (this.selectedElement !== container) {
          this.selectElement(container);
        }
        
        // Store initial values
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = img.offsetWidth;
        const startHeight = img.offsetHeight;
        const aspectRatio = startWidth / startHeight;
        const position = (handle as HTMLElement).dataset['handle'] || ''; // Fixed: using bracket notation
        
        // Temporarily disable editor content editing
        const originalContentEditable = this.canvasContent.nativeElement.contentEditable;
        this.canvasContent.nativeElement.contentEditable = 'false';
        
        // Add resizing class
        container.classList.add('resizing');
        
        // Handle mouse move for resizing
        const handleMouseMove = (moveEvent: MouseEvent) => {
          moveEvent.preventDefault();
          
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          
          let newWidth = startWidth;
          let newHeight = startHeight;
          
          switch(position) {
            case 'se':
              newWidth = startWidth + deltaX;
              newHeight = startHeight + deltaY;
              break;
            case 'sw':
              newWidth = startWidth - deltaX;
              newHeight = startHeight + deltaY;
              break;
            case 'ne':
              newWidth = startWidth + deltaX;
              newHeight = startHeight - deltaY;
              break;
            case 'nw':
              newWidth = startWidth - deltaX;
              newHeight = startHeight - deltaY;
              break;
          }
          
          // Maintain aspect ratio if shift key is pressed
          if (moveEvent.shiftKey) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              newHeight = newWidth / aspectRatio;
            } else {
              newWidth = newHeight * aspectRatio;
            }
          }
          
          // Apply new dimensions with minimum size
          img.style.width = `${Math.max(50, newWidth)}px`;
          img.style.height = `${Math.max(50, newHeight)}px`;
        };
        
        // Handle mouse up
        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          
          // Restore editor content editing
          this.canvasContent.nativeElement.contentEditable = originalContentEditable;
          
          // Remove resizing class
          container.classList.remove('resizing');
          
          // Save to history for undo
          this.saveToHistory();
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      });
    });
    
    // Setup rotation functionality
    const rotateHandle = container.querySelector('.rotate-handle');
    if (rotateHandle) {
      rotateHandle.addEventListener('mousedown', (mouseDownEvent: Event) => {
        const e = mouseDownEvent as MouseEvent; // Fixed: cast to MouseEvent
        e.preventDefault();
        e.stopPropagation();
        
        // Select the element if not already selected
        if (this.selectedElement !== container) {
          this.selectElement(container);
        }
        
        // Get center of image for rotation calculation
        const rect = img.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Get current rotation
        const currentRotation = parseInt(img.dataset['rotation'] || '0', 10); // Fixed: using bracket notation
        
        // Temporarily disable editor content editing
        const originalContentEditable = this.canvasContent.nativeElement.contentEditable;
        this.canvasContent.nativeElement.contentEditable = 'false';
        
        // Add rotating class
        container.classList.add('rotating');
        
        // Handle mouse move for rotation
        const handleMouseMove = (moveEvent: MouseEvent) => {
          moveEvent.preventDefault();
          
          // Calculate angle between center of image and current mouse position
          const deltaX = moveEvent.clientX - centerX;
          const deltaY = moveEvent.clientY - centerY;
          let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
          
          // Snap to 45-degree increments if shift is pressed
          if (moveEvent.shiftKey) {
            angle = Math.round(angle / 45) * 45;
          }
          
          // Apply rotation
          img.style.transform = `rotate(${angle}deg)`;
          img.dataset['rotation'] = angle.toString(); // Fixed: using bracket notation
        };
        
        // Handle mouse up
        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          
          // Restore editor content editing
          this.canvasContent.nativeElement.contentEditable = originalContentEditable;
          
          // Remove rotating class
          container.classList.remove('rotating');
          
          // Save to history for undo
          this.saveToHistory();
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      });
    }
    
    // Make image draggable
    container.addEventListener('mousedown', (mouseDownEvent: Event) => {
      const e = mouseDownEvent as MouseEvent; // Fixed: cast to MouseEvent
      
      // Skip if clicking on a handle
      if ((e.target as HTMLElement).classList.contains('resize-handle') || 
          (e.target as HTMLElement).classList.contains('rotate-handle')) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      // Select the element if not already selected
      if (this.selectedElement !== container) {
        this.selectElement(container);
      }
      
      // Calculate offset
      const rect = container.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      
      // Temporarily disable editor content editing
      const originalContentEditable = this.canvasContent.nativeElement.contentEditable;
      this.canvasContent.nativeElement.contentEditable = 'false';
      
      // Add dragging class
      container.classList.add('dragging');
      
      // Handle mouse move for dragging
      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        
        // Get editor bounds
        const editorRect = this.canvasContent.nativeElement.getBoundingClientRect();
        
        // Calculate new position (relative to editor)
        const newX = moveEvent.clientX - editorRect.left - offsetX;
        const newY = moveEvent.clientY - editorRect.top - offsetY;
        
        // Set position (with bounds checking)
        container.style.position = 'absolute';
        container.style.left = `${Math.max(0, Math.min(editorRect.width - rect.width, newX))}px`;
        container.style.top = `${Math.max(0, Math.min(editorRect.height - rect.height, newY))}px`;
      };
      
      // Handle mouse up
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Restore editor content editing
        this.canvasContent.nativeElement.contentEditable = originalContentEditable;
        
        // Remove dragging class
        container.classList.remove('dragging');
        
        // Save to history for undo
        this.saveToHistory();
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  // Helper methods for element selection
  selectElement(element: HTMLElement): void {
    // Deselect previous element if any
    this.deselectElement();
    
    // Select new element
    this.selectedElement = element;
    element.classList.add('selected');
    
    // Show resize handles
    const handles = element.querySelectorAll('.resize-handle, .rotate-handle');
    handles.forEach(handle => {
      (handle as HTMLElement).style.display = 'block';
    });
  }

  deselectElement(): void {
    if (this.selectedElement) {
      this.selectedElement.classList.remove('selected');
      
      // Hide resize handles
      const handles = this.selectedElement.querySelectorAll('.resize-handle, .rotate-handle');
      handles.forEach(handle => {
        (handle as HTMLElement).style.display = 'none';
      });
      
      this.selectedElement = null;
    }
  }

  // Handler for clicks outside selected elements
  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    // If clicked outside the selected element, deselect it
    if (this.selectedElement && 
        !this.selectedElement.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('.img-container') &&
        !(event.target as HTMLElement).closest('.table-container')) {
      this.deselectElement();
    }
  }

  // ====== TABLE HANDLING ======

  // Table modal methods
  openTableModal(): void {
    this.tableModalOpen = true;
    setTimeout(() => {
      if (this.tableModal?.nativeElement) {
        this.tableModal.nativeElement.focus();
      }
    }, 100);
  }

  closeTableModal(): void {
    this.tableModalOpen = false;
  }

  // Insert table method
  insertTable(): void {
    // Save current state for undo
    this.saveToHistory();
    
    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    // Create table
    const table = document.createElement('table');
    table.className = 'editor-table';
    table.style.borderCollapse = 'collapse';
    
    // Create table rows and cells
    for (let i = 0; i < this.tableRows; i++) {
      const row = document.createElement('tr');
      
      for (let j = 0; j < this.tableCols; j++) {
        const cell = i === 0 ? document.createElement('th') : document.createElement('td');
        cell.style.border = `1px ${this.tableBorderStyle} ${this.tableBorderColor}`;
        cell.style.padding = '8px';
        cell.contentEditable = 'true';
        
        // For the first row, create header cells
        if (i === 0) {
          cell.textContent = `Header ${j + 1}`;
          cell.style.fontWeight = 'bold';
          cell.style.backgroundColor = '#f8f9fa';
        } else {
          cell.textContent = `Cell ${i},${j}`;
        }
        
        // Create resize handle for columns
        if (j < this.tableCols - 1) {
          const resizeHandle = document.createElement('div');
          resizeHandle.className = 'table-resize-handle';
          cell.appendChild(resizeHandle);
          
          // Add resize functionality
          this.addColumnResizeHandlers(resizeHandle, table, j);
        }
        
        row.appendChild(cell);
      }
      
      table.appendChild(row);
    }
    
    // Add table controls
    const tableControls = document.createElement('div');
    tableControls.className = 'table-controls';
    
    // Row controls
    const addRowAboveBtn = this.createTableControlButton('Add Row Above', 'fa-arrow-up');
    addRowAboveBtn.addEventListener('click', () => this.addTableRow(table, 'above'));
    
    const addRowBelowBtn = this.createTableControlButton('Add Row Below', 'fa-arrow-down');
    addRowBelowBtn.addEventListener('click', () => this.addTableRow(table, 'below'));
    
    // Column controls
    const addColLeftBtn = this.createTableControlButton('Add Column Left', 'fa-arrow-left');
    addColLeftBtn.addEventListener('click', () => this.addTableColumn(table, 'left'));
    
    const addColRightBtn = this.createTableControlButton('Add Column Right', 'fa-arrow-right');
    addColRightBtn.addEventListener('click', () => this.addTableColumn(table, 'right'));
    
    // Delete controls
    const deleteRowBtn = this.createTableControlButton('Delete Row', 'fa-minus');
    deleteRowBtn.addEventListener('click', () => this.deleteTableRow(table));
    
    const deleteColBtn = this.createTableControlButton('Delete Column', 'fa-minus');
    deleteColBtn.addEventListener('click', () => this.deleteTableColumn(table));
    
    const deleteTableBtn = this.createTableControlButton('Delete Table', 'fa-trash-alt');
    deleteTableBtn.addEventListener('click', () => this.deleteTable(tableContainer));
    
    // Add controls to the container
    tableControls.appendChild(addRowAboveBtn);
    tableControls.appendChild(addRowBelowBtn);
    tableControls.appendChild(addColLeftBtn);
    tableControls.appendChild(addColRightBtn);
    tableControls.appendChild(deleteRowBtn);
    tableControls.appendChild(deleteColBtn);
    tableControls.appendChild(deleteTableBtn);
    
    // Add table and controls to container
    tableContainer.appendChild(tableControls);
    tableContainer.appendChild(table);
    
    // Focus the editor
    this.canvasContent.nativeElement.focus();
    
    // Insert at current selection point
    if (this.isSelectionInEditor() && this.range) {
      // Create a new paragraph for the table
      const tableParagraph = document.createElement('p');
      tableParagraph.className = 'table-paragraph';
      tableParagraph.appendChild(tableContainer);
      
      this.range.deleteContents();
      this.range.insertNode(tableParagraph);
      
      // Move cursor after table paragraph
      this.range.setStartAfter(tableParagraph);
      this.range.setEndAfter(tableParagraph);
      
      if (this.selection) {
        this.selection.removeAllRanges();
        this.selection.addRange(this.range);
      }
    } else {
      // If no selection, append to the end
      const tableParagraph = document.createElement('p');
      tableParagraph.className = 'table-paragraph';
      tableParagraph.appendChild(tableContainer);
      this.canvasContent.nativeElement.appendChild(tableParagraph);
    }
    
    // Add click handlers for table cells
    this.setupTableEvents(tableContainer, table);
    
    this.notify('Table inserted successfully', 'success');
    this.closeTableModal();
  }

  // Helper method to create table control buttons
  createTableControlButton(title: string, iconClass: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'table-control-btn';
    button.title = title;
    button.innerHTML = `<i class="fas ${iconClass}"></i>`;
    return button;
  }

  // Setup table events
  setupTableEvents(container: HTMLElement, table: HTMLTableElement): void {
    // Double-click to select table
    container.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle selected state
      if (this.selectedElement === container) {
        this.deselectElement();
      } else {
        this.selectElement(container);
        table.classList.add('selected');
      }
    });
    
    // Handle cell selection
    const cells = table.querySelectorAll('td, th');
    cells.forEach(cell => {
      cell.addEventListener('click', (e) => {
        // Clear previous cell selections
        table.querySelectorAll('.selected').forEach(selectedCell => {
          if (selectedCell !== table) { // Don't remove the selected class from the table itself
            selectedCell.classList.remove('selected');
          }
        });
        
        // Select this cell
        cell.classList.add('selected');
      });
    });
  }

  // Add column resize handlers
  addColumnResizeHandlers(handle: HTMLElement, table: HTMLTableElement, colIndex: number): void {
    handle.addEventListener('mousedown', (mouseDownEvent: Event) => {
      const e = mouseDownEvent as MouseEvent; // Fixed: cast to MouseEvent
      e.preventDefault();
      e.stopPropagation();
      
      const startX = e.clientX;
      const cell = handle.parentElement as HTMLElement;
      const startWidth = cell.offsetWidth;
      
      // Temporarily disable editor content editing
      const originalContentEditable = this.canvasContent.nativeElement.contentEditable;
      this.canvasContent.nativeElement.contentEditable = 'false';
      
      // Add resizing class
      table.classList.add('resizing');
      
      // Handle mouse move for resizing
      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(50, startWidth + deltaX);
        
        // Adjust width of all cells in this column
        const rows = table.rows;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].cells[colIndex]) {
            rows[i].cells[colIndex].style.width = `${newWidth}px`;
          }
        }
      };
      
      // Handle mouse up
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Restore editor content editing
        this.canvasContent.nativeElement.contentEditable = originalContentEditable;
        
        // Remove resizing class
        table.classList.remove('resizing');
        
        // Save to history for undo
        this.saveToHistory();
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  // Table manipulation methods
  addTableRow(table: HTMLTableElement, position: 'above' | 'below'): void {
    // Get selected cell to determine where to add the row
    const selectedCell = table.querySelector('td.selected, th.selected');
    if (!selectedCell) {
      this.notify('Please select a cell first', 'warning');
      return;
    }
    
    const selectedRow = selectedCell.parentElement as HTMLTableRowElement;
    const rowIndex = selectedRow.rowIndex;
    
    // Create new row
    const newRow = table.insertRow(position === 'above' ? rowIndex : rowIndex + 1);
    
    // Add cells to the new row
    for (let i = 0; i < selectedRow.cells.length; i++) {
      const newCell = newRow.insertCell(i);
      
      // Copy styles from corresponding cell in selected row
      const sourceCell = selectedRow.cells[i];
      newCell.style.border = sourceCell.style.border;
      newCell.style.padding = sourceCell.style.padding;
      newCell.contentEditable = 'true';
      
      // Add resize handle if needed
      if (i < selectedRow.cells.length - 1) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'table-resize-handle';
        newCell.appendChild(resizeHandle);
        
        // Add resize functionality
        this.addColumnResizeHandlers(resizeHandle, table, i);
      }
    }
    
    // Save to history for undo
    this.saveToHistory();
  }

  addTableColumn(table: HTMLTableElement, position: 'left' | 'right'): void {
    // Get selected cell to determine where to add the column
    const selectedCell = table.querySelector('td.selected, th.selected');
    if (!selectedCell) {
      this.notify('Please select a cell first', 'warning');
      return;
    }
    
    const cellIndex = (selectedCell as HTMLTableCellElement).cellIndex;
    const colIndex = position === 'left' ? cellIndex : cellIndex + 1;
    
    // Add a new cell to each row
    const rows = table.rows;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const newCell = i === 0 ? document.createElement('th') : document.createElement('td');
      
      // Copy styles from selected cell
      newCell.style.border = (selectedCell as HTMLElement).style.border;
      newCell.style.padding = (selectedCell as HTMLElement).style.padding;
      newCell.contentEditable = 'true';
      
      // Add content based on row type
      if (i === 0) {
        newCell.textContent = `Header ${colIndex + 1}`;
        newCell.style.fontWeight = 'bold';
        newCell.style.backgroundColor = '#f8f9fa';
      }
      
      // Add resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'table-resize-handle';
      newCell.appendChild(resizeHandle);
      
      // Insert the cell at the right position
      if (colIndex >= row.cells.length) {
        row.appendChild(newCell);
      } else {
        row.insertBefore(newCell, row.cells[colIndex]);
      }
      
      // Add resize functionality
      this.addColumnResizeHandlers(resizeHandle, table, colIndex);
    }
    
    // Save to history for undo
    this.saveToHistory();
  }

  deleteTableRow(table: HTMLTableElement): void {
    // Get selected cell to determine which row to delete
    const selectedCell = table.querySelector('td.selected, th.selected');
    if (!selectedCell) {
      this.notify('Please select a cell first', 'warning');
      return;
    }
    
    const selectedRow = selectedCell.parentElement as HTMLTableRowElement;
    
    // Ensure we don't delete the last row
    if (table.rows.length <= 1) {
      this.notify('Cannot delete the last row', 'warning');
      return;
    }
    
    // Delete the row
    table.deleteRow(selectedRow.rowIndex);
    
    // Save to history for undo
    this.saveToHistory();
  }

  deleteTableColumn(table: HTMLTableElement): void {
    // Get selected cell to determine which column to delete
    const selectedCell = table.querySelector('td.selected, th.selected');
    if (!selectedCell) {
      this.notify('Please select a cell first', 'warning');
      return;
    }
    
    const cellIndex = (selectedCell as HTMLTableCellElement).cellIndex;
    
    // Ensure we don't delete the last column
    if (table.rows[0].cells.length <= 1) {
      this.notify('Cannot delete the last column', 'warning');
      return;
    }
    
    // Delete the column from each row
    const rows = table.rows;
    for (let i = 0; i < rows.length; i++) {
      rows[i].deleteCell(cellIndex);
    }
    
    // Save to history for undo
    this.saveToHistory();
  }

  deleteTable(tableContainer: HTMLElement): void {
    // Get the parent paragraph
    const tableParagraph = tableContainer.parentElement;
    
    if (tableParagraph) {
      // Remove the table container
      tableParagraph.parentElement?.removeChild(tableParagraph);
      
      // Deselect the element
      this.deselectElement();
      
      // Save to history for undo
      this.saveToHistory();
    }
  }
}