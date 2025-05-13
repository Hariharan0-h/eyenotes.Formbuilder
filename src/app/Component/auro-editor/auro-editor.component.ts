import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, Renderer2 } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';

type SupportedLanguage = 'english' | 'tamil' | 'telungu' | 'malayalam' | 'hindi';

export interface EditorObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation?: number;
  element?: HTMLElement;
}

export interface ImageObject extends EditorObject {
  src: string;
}

export interface LineObject extends EditorObject {
  orientation: 'horizontal' | 'vertical';
  thickness: number;
  color: string;
}

@Component({
  selector: 'app-auro-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './auro-editor.component.html',
  styleUrls: ['./auro-editor.component.css']
})
export class AuroEditorComponent implements OnInit, AfterViewInit {
  @ViewChild('canvasContent') canvasContent!: ElementRef;
  @ViewChild('colorInput') colorInput!: ElementRef;
  
  // Objects management
  objects: EditorObject[] = [];
  selectedObject: EditorObject | null = null;
  nextId = 1;
  
  // Dragging state
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragStartObjX = 0;
  dragStartObjY = 0;
  
  // Resizing state
  isResizing = false;
  resizeHandle = '';
  resizeStartX = 0;
  resizeStartY = 0;
  resizeStartWidth = 0;
  resizeStartHeight = 0;
  
  // Rotation state
  isRotating = false;
  rotateStartX = 0;
  rotateStartY = 0;
  rotateStartAngle = 0;

  zoom = 100;
  
  // Form and UI state
  documentForm!: FormGroup;
  showFormFields = true;
  showHeader = true;
  
  // Line properties
  lineThickness = 2;
  lineColor = '#000000';
  
  // Pages
  pages: {id: number, content: string}[] = [];
  currentPageIndex = 0;
  
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
  
  // Border properties
  showBorder = false;
  currentBorderStyle = 'solid';
  
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
  
  // Image modal
  showImageModal = false;

  // Language specific font mappings with proper typing
  languageFontMap: Record<SupportedLanguage, string[]> = {
    english: ['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Montserrat'],
    tamil: ['Noto Sans Tamil', 'Latha', 'Vijaya', 'Kavivanar', 'Catamaran', 'Meera'],
    telungu: ['Noto Sans Telugu', 'Gautami', 'Telugu Sangam MN', 'Baloo Tammudu 2', 'Mandali', 'NTR'],
    malayalam: ['Noto Sans Malayalam', 'Manjari', 'Chilanka', 'Gayathri', 'Keraleeyam', 'Baloo Chettan 2'],
    hindi: ['Noto Sans Devanagari', 'Poppins', 'Hind', 'Kalam', 'Teko', 'Karma']
  };

  // Additional font sizes for complex scripts with proper typing
  languageFontSizes: Record<SupportedLanguage, string[]> = {
    english: ['10', '12', '14', '16', '18', '20', '24', '32', '48'],
    tamil: ['14', '16', '18', '20', '22', '24', '28', '32', '48'],
    telungu: ['14', '16', '18', '20', '22', '24', '28', '32', '48'],
    malayalam: ['14', '16', '18', '20', '22', '24', '28', '32', '48'],
    hindi: ['14', '16', '18', '20', '22', '24', '28', '32', '48']
  };

  // Current selected language
  currentLanguage: SupportedLanguage = 'english';

  // Current font options based on language
  availableFonts: string[] = [];
  availableFontSizes: string[] = [];
  
  constructor(private fb: FormBuilder, private http: HttpClient, private renderer: Renderer2) { }

  ngOnInit(): void {
    this.documentForm = this.fb.group({
      purpose: ['purpose1', Validators.required],
      name: ['', Validators.required],
      formNumber: ['', Validators.required],
      language: ['english', Validators.required],
      pagelayout: ['portrait', Validators.required],
      paperSize: ['A4', Validators.required],
      marginTop: [1.27, Validators.required],
      marginBottom: [1.27, Validators.required],
      marginLeft: [1.27, Validators.required],
      marginRight: [1.27, Validators.required],
      content: ['']
    });
    
    // Initialize with one empty page
    this.pages = [{
      id: new Date().getTime(),
      content: '<p>Start typing here...</p>'
    }];

    // Initialize font options based on language
    this.availableFonts = [...this.languageFontMap.english];
    this.availableFontSizes = [...this.languageFontSizes.english];

    // Subscribe to language changes to update fonts
    this.documentForm.get('language')?.valueChanges.subscribe((lang: string) => {
      this.updateLanguageFonts();
    });
  }

  /**
   * Updates available fonts and font sizes based on selected language
   */
  updateLanguageFonts(): void {
    // Get the selected language from the form
    const formLang = this.documentForm.get('language')?.value;
    // Validate that it's a supported language
    const lang = (formLang && 
      ['english', 'tamil', 'telungu', 'malayalam', 'hindi'].includes(formLang)) 
      ? formLang as SupportedLanguage 
      : 'english';
    
    this.currentLanguage = lang;
    
    // Now TypeScript knows lang is a valid key
    this.availableFonts = this.languageFontMap[lang];
    this.availableFontSizes = this.languageFontSizes[lang];
    
    // Update current font family if needed
    if (!this.availableFonts.includes(this.currentFontFamily)) {
      this.currentFontFamily = this.availableFonts[0];
      // Apply to selected text if any
      if (this.isSelectionInEditor()) {
        this.applyTextFormatting('fontName', this.currentFontFamily);
      }
    }
    
    // Update font size if current size is smaller than minimum for this language
    const minFontSize = parseInt(this.availableFontSizes[0], 10);
    if (parseInt(this.currentFontSize, 10) < minFontSize) {
      this.currentFontSize = minFontSize.toString();
      // Apply to selected text if any
      if (this.isSelectionInEditor()) {
        this.applyTextFormatting('fontSize', this.currentFontSize);
      }
    }
    
    // Update editor content language attribute
    if (this.canvasContent && this.canvasContent.nativeElement) {
      this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
    }
    
    // Notify user
    this.notify(`Font settings updated for ${lang}`, 'success');
  }

  ngAfterViewInit(): void {
    this.setupEditor();
    this.saveToHistory();
    
    // Setup global mouse event handlers for object manipulation
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }
  
  ngOnDestroy(): void {
    // Cleanup event listeners on destroy
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('selectionchange', this.handleSelectionChange);
  }
  
  // ====== PAGE MANAGEMENT ======
  
  addPage(): void {
    this.saveCurrentPageContent();
    
    const newPage = {
      id: new Date().getTime(),
      content: '<p>New page content...</p>'
    };
    
    this.pages.push(newPage);
    this.currentPageIndex = this.pages.length - 1;
    
    // Defer setting content until after view is updated
    setTimeout(() => {
      if (this.canvasContent && this.canvasContent.nativeElement) {
        this.canvasContent.nativeElement.innerHTML = this.pages[this.currentPageIndex].content;
        this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
        this.canvasContent.nativeElement.focus();
        this.setupObjectHandlers();
      }
    });
    
    this.notify('New page added', 'success');
    this.saveToHistory();
  }

  removePage(index: number): void {
    if (this.pages.length <= 1) {
      this.notify('Cannot remove the last page', 'warning');
      return;
    }
    
    this.pages.splice(index, 1);
    
    if (this.currentPageIndex >= this.pages.length) {
      this.currentPageIndex = this.pages.length - 1;
    }
    
    // Defer content update until after view changes
    setTimeout(() => {
      if (this.canvasContent && this.canvasContent.nativeElement) {
        this.canvasContent.nativeElement.innerHTML = this.pages[this.currentPageIndex].content;
        this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
        this.canvasContent.nativeElement.focus();
        this.setupObjectHandlers();
      }
    });
    
    this.notify('Page removed', 'success');
    this.saveToHistory();
  }

  switchToPage(index: number): void {
    this.saveCurrentPageContent();
    this.currentPageIndex = index;
    
    // Deselect any selected object
    this.selectedObject = null;
    
    // Defer content update until after view changes
    setTimeout(() => {
      if (this.canvasContent && this.canvasContent.nativeElement) {
        this.canvasContent.nativeElement.innerHTML = this.pages[this.currentPageIndex].content;
        this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
        this.canvasContent.nativeElement.focus();
        this.setupObjectHandlers();
      }
    });
  }

  saveCurrentPageContent(): void {
    if (this.canvasContent && this.canvasContent.nativeElement) {
      this.pages[this.currentPageIndex].content = this.canvasContent.nativeElement.innerHTML;
    }
  }
  
  // ====== EDITOR SETUP ======
  
  setupEditor(): void {
    if (this.canvasContent && this.canvasContent.nativeElement) {
      // Set initial content from pages array
      this.canvasContent.nativeElement.innerHTML = this.pages[this.currentPageIndex].content;
      this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
      this.canvasContent.nativeElement.focus();
      
      // Setup object handlers (selection, resize, etc.)
      this.setupObjectHandlers();
    }
    
    // Track selection changes
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }
  
  setupObjectHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Reset objects array for current page
    this.objects = [];
    
    // Setup handlers for all editor objects (images, lines, etc.)
    this.setupImageHandlers();
    this.setupLineHandlers();
    
    // Deselect on click outside
    this.canvasContent.nativeElement.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.canvasContent.nativeElement) {
        this.selectedObject = null;
      }
    });
  }
  
  setupImageHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Find all img containers
    const imgContainers = this.canvasContent.nativeElement.querySelectorAll('.img-container');
    
    imgContainers.forEach((container: HTMLElement) => {
      // Remove existing click listeners to avoid duplicates
      const newContainer = container.cloneNode(true) as HTMLElement;
      container.parentNode?.replaceChild(newContainer, container);
      
      // Add click handler for selection
      newContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectObject(newContainer, 'image');
      });
      
      // Add mousedown handler for dragging
      newContainer.addEventListener('mousedown', (e) => {
        if (this.isResizing || this.isRotating) return;
        if (e.target === newContainer || (e.target as HTMLElement).tagName === 'IMG') {
          e.preventDefault(); // Prevent text selection during drag
          this.startDrag(e, newContainer);
        }
      });
      
      // Find the image element and track its dimensions
      const imgElement = newContainer.querySelector('img');
      if (imgElement) {
        const rect = newContainer.getBoundingClientRect();
        
        // Create or update object in our objects array
        const existingObj = this.objects.find(obj => 
          obj.element === newContainer || 
          (obj as ImageObject).src === imgElement.src
        );
        
        if (existingObj) {
          existingObj.element = newContainer;
          existingObj.width = rect.width;
          existingObj.height = rect.height;
        } else {
          const newObj: ImageObject = {
            id: this.generateId(),
            type: 'image',
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            zIndex: this.objects.length + 1,
            rotation: 0,
            src: imgElement.src,
            element: newContainer
          };
          this.objects.push(newObj);
        }
      }
    });
  }
  
  setupLineHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Find all line containers
    const lineContainers = this.canvasContent.nativeElement.querySelectorAll('.line-container');
    
    lineContainers.forEach((container: HTMLElement) => {
      // Remove existing click listeners to avoid duplicates
      const newContainer = container.cloneNode(true) as HTMLElement;
      container.parentNode?.replaceChild(newContainer, container);
      
      // Add click handler for selection
      newContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const orientation = newContainer.getAttribute('data-orientation') as 'horizontal' | 'vertical';
        this.selectObject(newContainer, 'line', orientation);
      });
      
      // Add mousedown handler for dragging
      newContainer.addEventListener('mousedown', (e) => {
        if (this.isResizing || this.isRotating) return;
        if (e.target === newContainer || (e.target as HTMLElement).classList.contains('editor-line')) {
          e.preventDefault(); // Prevent text selection during drag
          this.startDrag(e, newContainer);
        }
      });
      
      // Track line dimensions
      const rect = newContainer.getBoundingClientRect();
      const orientation = newContainer.getAttribute('data-orientation') as 'horizontal' | 'vertical';
      const thickness = parseInt(newContainer.getAttribute('data-thickness') || '2');
      const color = newContainer.getAttribute('data-color') || '#000000';
      
      // Create or update object in our objects array
      const existingObj = this.objects.find(obj => obj.element === newContainer);
      
      if (existingObj && existingObj.type === 'line') {
        existingObj.element = newContainer;
        existingObj.width = rect.width;
        existingObj.height = rect.height;
        (existingObj as LineObject).orientation = orientation;
        (existingObj as LineObject).thickness = thickness;
        (existingObj as LineObject).color = color;
      } else {
        const newObj: LineObject = {
          id: this.generateId(),
          type: 'line',
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          zIndex: this.objects.length + 1,
          rotation: 0,
          orientation: orientation,
          thickness: thickness,
          color: color,
          element: newContainer
        };
        this.objects.push(newObj);
      }
    });
  }
  
  toggleFormFields(): void {
    this.showFormFields = !this.showFormFields;
  }

  toggleHeader(): void {
    this.showHeader = !this.showHeader;
  }
  
  handleSelectionChange = (): void => {
    this.selection = window.getSelection();
    if (this.selection && this.selection.rangeCount > 0) {
      this.range = this.selection.getRangeAt(0);
      
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
    
    const parentEl = this.selection.anchorNode?.parentElement;
    if (!parentEl) return;
    
    this.isBold = document.queryCommandState('bold');
    this.isItalic = document.queryCommandState('italic');
    this.isUnderlined = document.queryCommandState('underline');
    
    if (parentEl.style.textAlign === 'center') {
      this.currentAlignment = 'center';
    } else if (parentEl.style.textAlign === 'right') {
      this.currentAlignment = 'right';
    } else if (parentEl.style.textAlign === 'justify') {
      this.currentAlignment = 'justify';
    } else {
      this.currentAlignment = 'left';
    }
    
    const fontFamily = window.getComputedStyle(parentEl).fontFamily;
    if (fontFamily) {
      const fonts = fontFamily.split(',');
      if (fonts.length > 0) {
        const primaryFont = fonts[0].trim().replace(/["']/g, '');
        this.currentFontFamily = primaryFont;
      }
    }
    
    const fontSize = window.getComputedStyle(parentEl).fontSize;
    if (fontSize) {
      this.currentFontSize = fontSize.replace('px', '');
    }
    
    const color = window.getComputedStyle(parentEl).color;
    if (color) {
      this.currentColor = this.rgbToHex(color);
    }
    
    // Check border
    const border = window.getComputedStyle(parentEl).border;
    if (border && border !== 'none') {
      this.showBorder = true;
      // Try to extract border style
      const borderStyle = window.getComputedStyle(parentEl).borderStyle;
      if (borderStyle && ['solid', 'dotted', 'dashed', 'double'].includes(borderStyle)) {
        this.currentBorderStyle = borderStyle;
      }
    } else {
      this.showBorder = false;
    }
  }
  
  rgbToHex(rgb: string): string {
    if (rgb.startsWith('#')) return rgb;
    
    const rgbMatch = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!rgbMatch) return '#000000';
    
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // ====== TEXT FORMATTING ======
  
  applyTextFormatting(command: string, value: string = ''): void {
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    this.saveToHistory();
    document.execCommand(command, false, value);
    this.updateFormatButtons();
    // Don't show notification for every formatting change as it can be distracting
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
    this.lineColor = input.value; // Also update line color
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

  indent(): void {
    this.applyTextFormatting('indent');
    this.notify('Indentation increased', 'success');
  }

  outdent(): void {
    this.applyTextFormatting('outdent');
    this.notify('Indentation decreased', 'success');
  }

  // ====== BORDER CONTROLS ======
  
  /**
   * Toggle border on selected element or current paragraph
   */
  toggleBorder(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.showBorder = checkbox.checked;
    
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    // Get the current selection or current paragraph
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const parentEl = this.getClosestBlock(range.startContainer);
    
    if (parentEl) {
      this.saveToHistory();
      
      if (this.showBorder) {
        parentEl.style.border = `1px ${this.currentBorderStyle} #000`;
        parentEl.style.padding = '8px';
      } else {
        parentEl.style.border = 'none';
        parentEl.style.padding = '0';
      }
      
      this.notify(`Border ${this.showBorder ? 'added' : 'removed'}`, 'success');
      this.saveCurrentPageContent();
    }
  }

  /**
   * Set border style for the selected element or current paragraph
   */
  setBorderStyle(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select?.value) return;
    
    this.currentBorderStyle = select.value;
    
    // If border is not currently shown, don't apply anything
    if (!this.showBorder) return;
    
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    // Get the current selection or current paragraph
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const parentEl = this.getClosestBlock(range.startContainer);
    
    if (parentEl) {
      this.saveToHistory();
      parentEl.style.border = `1px ${this.currentBorderStyle} #000`;
      
      this.notify(`Border style updated to ${this.currentBorderStyle}`, 'success');
      this.saveCurrentPageContent();
    }
  }

  /**
   * Get the closest block element parent
   */
  getClosestBlock(node: Node): HTMLElement | null {
    // Handle null node
    if (!node) return null;
    
    // Find the first element node going up the tree
    let current: Node | null = node;
    while (current && current.nodeType !== Node.ELEMENT_NODE) {
      // Add explicit type annotation to parentNode
      const parentNode: ParentNode | null = current.parentNode;
      if (!parentNode) break; // Handle null parent
      current = parentNode;
    }
    
    // If we didn't find an element, return null
    if (!current || current.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    
    // Find the closest block element
    let element = current as HTMLElement;
    while (element && 
          element !== this.canvasContent.nativeElement && 
          getComputedStyle(element).display !== 'block') {
      const parentElement: HTMLElement | null = element.parentElement;
      if (!parentElement) break; // Handle null parent
      element = parentElement;
    }
    
    if (!element || element === this.canvasContent.nativeElement) {
      return null;
    }
    
    return element;
  }

  /**
   * Insert a field placeholder at the current cursor position
   */
  insertField(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select?.value) return;
    
    const fieldName = select.value;
    
    // Focus the editor if it's not already focused
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    this.saveToHistory();
    
    // Get the current selection
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // Create the field span element
    const fieldSpan = document.createElement('span');
    fieldSpan.classList.add('field-placeholder');
    fieldSpan.setAttribute('data-field', fieldName);
    fieldSpan.contentEditable = 'false';
    fieldSpan.innerText = `{{${fieldName}}}`;
    
    // Insert the field at the current cursor position
    range.deleteContents();
    range.insertNode(fieldSpan);
    
    // Move cursor after the inserted field
    range.setStartAfter(fieldSpan);
    range.setEndAfter(fieldSpan);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Reset the dropdown
    select.value = '';
    
    this.notify(`Field ${fieldName} inserted`, 'success');
    this.saveCurrentPageContent();
  }

  // ====== HISTORY MANAGEMENT ======
  
  saveToHistory(): void {
    if (!this.canvasContent) return;
    
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.undoStack.push(currentState);
    this.redoStack = [];
    
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }
  }
  
  undo(): void {
    if (this.undoStack.length === 0) {
      this.notify('Nothing to undo', 'warning');
      return;
    }
    
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.redoStack.push(currentState);
    
    const previousState = this.undoStack.pop();
    if (previousState) {
      this.canvasContent.nativeElement.innerHTML = previousState;
      this.setupObjectHandlers();
      this.notify('Undo successful', 'success');
    }
  }
  
  redo(): void {
    if (this.redoStack.length === 0) {
      this.notify('Nothing to redo', 'warning');
      return;
    }
    
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.undoStack.push(currentState);
    
    const nextState = this.redoStack.pop();
    if (nextState) {
      this.canvasContent.nativeElement.innerHTML = nextState;
      this.setupObjectHandlers();
      this.notify('Redo successful', 'success');
    }
  }
  
  // ====== OBJECT MANAGEMENT ======
  
  generateId(): string {
    return `obj-${this.nextId++}`;
  }
  
  // ====== LINE CREATION ======
  
  addHorizontalLine(): void {
    this.createLine('horizontal');
  }
  
  addVerticalLine(): void {
    this.createLine('vertical');
  }
  
  createLine(orientation: 'horizontal' | 'vertical'): void {
    // Save current state for undo
    this.saveToHistory();
    
    if (!this.canvasContent?.nativeElement) return;
    
    // Focus the editor first
    this.canvasContent.nativeElement.focus();
    
    // Create line container
    const lineContainer = document.createElement('div');
    lineContainer.className = 'line-container';
    lineContainer.setAttribute('data-orientation', orientation);
    lineContainer.setAttribute('data-thickness', this.lineThickness.toString());
    lineContainer.setAttribute('data-color', this.lineColor);
    
    // Create the line element
    const lineElement = document.createElement('div');
    lineElement.className = 'editor-line';
    
    if (orientation === 'horizontal') {
      lineElement.style.width = '200px';
      lineElement.style.height = `${this.lineThickness}px`;
    } else {
      lineElement.style.height = '200px';
      lineElement.style.width = `${this.lineThickness}px`;
    }
    
    lineElement.style.backgroundColor = this.lineColor;
    
    // Add the line to the container
    lineContainer.appendChild(lineElement);
    
    // Create paragraph for the line (for proper spacing)
    const lineParagraph = document.createElement('p');
    lineParagraph.className = 'line-paragraph';
    lineParagraph.appendChild(lineContainer);
    
    // Handle insertions at selection or at end
    if (this.isSelectionInEditor() && this.range) {
      // Insert at current selection
      this.range.deleteContents();
      this.range.insertNode(lineParagraph);
      
      // Create a new paragraph after the line if needed
      const afterParagraph = document.createElement('p');
      afterParagraph.innerHTML = '<br>';
      
      // Insert the paragraph after the line paragraph
      lineParagraph.parentNode?.insertBefore(afterParagraph, lineParagraph.nextSibling);
      
      // Move cursor to the new paragraph
      const newRange = document.createRange();
      newRange.setStart(afterParagraph, 0);
      newRange.collapse(true);
      
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else {
      // If no selection, append to the end
      this.canvasContent.nativeElement.appendChild(lineParagraph);
      
      // Also add a paragraph after the line
      const afterParagraph = document.createElement('p');
      afterParagraph.innerHTML = '<br>';
      this.canvasContent.nativeElement.appendChild(afterParagraph);
      
      // Move cursor to the new paragraph
      const newRange = document.createRange();
      newRange.setStart(afterParagraph, 0);
      newRange.collapse(true);
      
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }
    
    // Create a new line object and add it to our objects array
    const rect = lineContainer.getBoundingClientRect();
    const newLineObj: LineObject = {
      id: this.generateId(),
      type: 'line',
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      zIndex: this.objects.length + 1,
      rotation: 0,
      orientation,
      thickness: this.lineThickness,
      color: this.lineColor,
      element: lineContainer
    };
    
    this.objects.push(newLineObj);
    this.selectObject(lineContainer, 'line', orientation);
    
    // Setup object handlers for the new container
    this.setupObjectHandlers();
    
    // Notify success
    this.notify(`${orientation} line added successfully`, 'success');
    
    // Save current page content
    this.saveCurrentPageContent();
  }
  
  // ====== OBJECT SELECTION ======
  
  selectObject(element: HTMLElement, type: string, orientation?: 'horizontal' | 'vertical'): void {
    // Find the corresponding object
    const obj = this.objects.find(o => o.element === element);
    
    if (obj) {
      this.selectedObject = obj;
      
      // Add selected class to the element
      element.classList.add('selected');
      
      // Remove selected class from all other elements
      if (type === 'image') {
        const allContainers = this.canvasContent.nativeElement.querySelectorAll('.img-container');
        allContainers.forEach((el: HTMLElement) => {
          if (el !== element) {
            el.classList.remove('selected');
          }
        });
      } else if (type === 'line') {
        const allContainers = this.canvasContent.nativeElement.querySelectorAll('.line-container');
        allContainers.forEach((el: HTMLElement) => {
          if (el !== element) {
            el.classList.remove('selected');
          }
        });
      }
      
      // Update the position of resize handlers after selection
      setTimeout(() => this.updateResizeHandlersPosition(), 0);
    }
  }
  
  /**
   * Updates the position of resize handlers to match the selected object
   */
  updateResizeHandlersPosition(): void {
    if (!this.selectedObject || !this.selectedObject.element) return;
    
    const element = this.selectedObject.element;
    const rect = element.getBoundingClientRect();
    
    // Get the resize controls container
    const resizeControls = document.querySelector('.resize-controls') as HTMLElement;
    if (!resizeControls) return;
    
    // Position the resize controls container to match the selected element
    resizeControls.style.top = rect.top + 'px';
    resizeControls.style.left = rect.left + 'px';
    resizeControls.style.width = rect.width + 'px';
    resizeControls.style.height = rect.height + 'px';
    
    // Consider object's rotation if any
    if (this.selectedObject.rotation) {
      resizeControls.style.transform = `rotate(${this.selectedObject.rotation}deg)`;
      resizeControls.style.transformOrigin = 'center center';
    } else {
      resizeControls.style.transform = '';
    }
  }
  
  // ====== IMAGE HANDLING ======
  
  uploadImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      this.notify('No file selected', 'warning');
      return;
    }
    
    // Only allow image files
    if (!file.type.startsWith('image/')) {
      this.notify('Please select a valid image file', 'error');
      return;
    }
    
    // Save current state for undo
    this.saveToHistory();
    
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!this.canvasContent?.nativeElement) return;
      
      // Focus the editor first
      this.canvasContent.nativeElement.focus();
      
      // Create image element
      const img = document.createElement('img');
      img.src = e.target?.result as string;
      img.className = 'editor-image';
      img.style.maxWidth = '100%';
      img.alt = file.name;
      
      // Ensure image is properly loaded
      img.onload = () => {
        // Create image container
        const imgContainer = document.createElement('div');
        imgContainer.className = 'img-container';
        imgContainer.style.position = 'relative'; // Make sure position is set for drag and resize
        imgContainer.appendChild(img);
        
        // Add click handler for selection
        imgContainer.addEventListener('click', (evt) => {
          evt.stopPropagation();
          this.selectObject(imgContainer, 'image');
        });
        
        // Add mousedown handler for dragging
        imgContainer.addEventListener('mousedown', (evt) => {
          if (this.isResizing || this.isRotating) return;
          if (evt.target === imgContainer || (evt.target as HTMLElement).tagName === 'IMG') {
            evt.preventDefault(); // Prevent text selection during drag
            this.startDrag(evt, imgContainer);
          }
        });
        
        // Create paragraph for image (this is critical for proper spacing)
        const imgParagraph = document.createElement('p');
        imgParagraph.className = 'image-paragraph';
        imgParagraph.appendChild(imgContainer);
        
        // Handle insertions at selection or at end
        if (this.isSelectionInEditor() && this.range) {
          // Insert at current selection
          this.range.deleteContents();
          this.range.insertNode(imgParagraph);
          
          // Create a new paragraph after the image if needed
          const afterParagraph = document.createElement('p');
          afterParagraph.innerHTML = '<br>';
          
          // Insert the paragraph after the image paragraph
          imgParagraph.parentNode?.insertBefore(afterParagraph, imgParagraph.nextSibling);
          
          // Move cursor to the new paragraph
          const newRange = document.createRange();
          newRange.setStart(afterParagraph, 0);
          newRange.collapse(true);
          
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } else {
          // If no selection, append to the end
          this.canvasContent.nativeElement.appendChild(imgParagraph);
          
          // Also add a paragraph after the image
          const afterParagraph = document.createElement('p');
          afterParagraph.innerHTML = '<br>';
          this.canvasContent.nativeElement.appendChild(afterParagraph);
          
          // Move cursor to the new paragraph
          const newRange = document.createRange();
          newRange.setStart(afterParagraph, 0);
          newRange.collapse(true);
          
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }
        
        // Create a new image object and add it to our objects array
        const rect = imgContainer.getBoundingClientRect();
        const newImageObj: ImageObject = {
          id: this.generateId(),
          type: 'image',
          x: 0, // Will be set by position styles
          y: 0, // Will be set by position styles
          width: rect.width,
          height: rect.height,
          zIndex: this.objects.length + 1,
          rotation: 0,
          src: img.src,
          element: imgContainer
        };
        
        this.objects.push(newImageObj);
        this.selectObject(imgContainer, 'image');
        
        // Close modal
        this.showImageModal = false;
        
        // Notify success
        this.notify('Image added successfully', 'success');
        
        // Save current page content
        this.saveCurrentPageContent();
      };
    };
    
    reader.readAsDataURL(file);
  }
  
  // ====== DRAGGING FUNCTIONALITY ======
  
  startDrag(e: MouseEvent, element: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    
    // Find the corresponding object
    const obj = this.objects.find(o => o.element === element);
    if (!obj) return;
    
    // Select this object
    if (obj.type === 'image') {
      this.selectObject(element, 'image');
    } else if (obj.type === 'line') {
      const orientation = element.getAttribute('data-orientation') as 'horizontal' | 'vertical';
      this.selectObject(element, 'line', orientation);
    }
    
    // Make sure the element has position: relative
    if (!element.style.position || element.style.position !== 'relative') {
      element.style.position = 'relative';
    }
    
    // Store drag start information
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    
    // Get current position from style
    let left = parseInt(element.style.left || '0', 10);
    let top = parseInt(element.style.top || '0', 10);
    
    this.dragStartObjX = left;
    this.dragStartObjY = top;
    
    // Add dragging class
    element.classList.add('dragging');
  }
  
  // ====== RESIZING FUNCTIONALITY ======
  
  startResize(e: MouseEvent, handle: string): void {
    e.preventDefault();
    e.stopPropagation();
    
    if (!this.selectedObject || !this.selectedObject.element) return;
    
    // Initialize resizing state
    this.isResizing = true;
    this.resizeHandle = handle;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    
    const rect = this.selectedObject.element.getBoundingClientRect();
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;
    
    // Add resizing class to the element
    this.selectedObject.element.classList.add('resizing');
  }
  
  // ====== ROTATION FUNCTIONALITY ======
  
  startRotate(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    
    if (!this.selectedObject || !this.selectedObject.element) return;
    
    // Initialize rotation state
    this.isRotating = true;
    
    // Calculate center of object
    const rect = this.selectedObject.element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate initial angle
    const angleRadians = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    this.rotateStartAngle = (angleRadians * 180 / Math.PI);
    
    // Store current rotation
    this.rotateStartX = this.selectedObject.rotation || 0;
  }
  
  // ====== MOUSE MOVE HANDLER ======
  
  handleMouseMove = (e: MouseEvent): void => {
    if (this.isDragging && this.selectedObject && this.selectedObject.element) {
      // Calculate the new position
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      const newX = this.dragStartObjX + deltaX;
      const newY = this.dragStartObjY + deltaY;
      
      // Update the element's position
      const element = this.selectedObject.element;
      element.style.position = 'relative';
      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
      
      // Update object coordinates
      this.selectedObject.x = newX;
      this.selectedObject.y = newY;
      
      // Update resize handlers position
      this.updateResizeHandlersPosition();
      
    } else if (this.isResizing && this.selectedObject && this.selectedObject.element) {
      // Calculate the deltas
      const deltaX = e.clientX - this.resizeStartX;
      const deltaY = e.clientY - this.resizeStartY;
      
      // Get the element
      const element = this.selectedObject.element;
      let newWidth = this.resizeStartWidth;
      let newHeight = this.resizeStartHeight;
      let leftOffset = parseInt(element.style.left || '0', 10);
      let topOffset = parseInt(element.style.top || '0', 10);
      
      if (this.selectedObject.type === 'image') {
        const img = element.querySelector('img');
        if (!img) return;
        
        // Handle each resize direction
        switch(this.resizeHandle) {
          case 'se':
            newWidth = Math.max(50, this.resizeStartWidth + deltaX);
            newHeight = Math.max(50, this.resizeStartHeight + deltaY);
            break;
          case 'sw':
            newWidth = Math.max(50, this.resizeStartWidth - deltaX);
            newHeight = Math.max(50, this.resizeStartHeight + deltaY);
            leftOffset = parseInt(element.style.left || '0', 10) + deltaX;
            break;
          case 'ne':
            newWidth = Math.max(50, this.resizeStartWidth + deltaX);
            newHeight = Math.max(50, this.resizeStartHeight - deltaY);
            topOffset = parseInt(element.style.top || '0', 10) + deltaY;
            break;
          case 'nw':
            newWidth = Math.max(50, this.resizeStartWidth - deltaX);
            newHeight = Math.max(50, this.resizeStartHeight - deltaY);
            leftOffset = parseInt(element.style.left || '0', 10) + deltaX;
            topOffset = parseInt(element.style.top || '0', 10) + deltaY;
            break;
          case 'n':
            newHeight = Math.max(50, this.resizeStartHeight - deltaY);
            topOffset = parseInt(element.style.top || '0', 10) + deltaY;
            break;
          case 's':
            newHeight = Math.max(50, this.resizeStartHeight + deltaY);
            break;
          case 'e':
            newWidth = Math.max(50, this.resizeStartWidth + deltaX);
            break;
          case 'w':
            newWidth = Math.max(50, this.resizeStartWidth - deltaX);
            leftOffset = parseInt(element.style.left || '0', 10) + deltaX;
            break;
        }
        
        // Ensure element has position relative
        element.style.position = 'relative';
        
        // Update element position
        element.style.left = `${leftOffset}px`;
        element.style.top = `${topOffset}px`;
        
        // Update the image size with the bounded values
        img.style.width = `${newWidth}px`;
        img.style.height = `${newHeight}px`;
        
      } else if (this.selectedObject.type === 'line') {
        const line = element.querySelector('.editor-line') as HTMLElement;
        if (!line) return;
        
        // Get line orientation
        const orientation = (this.selectedObject as LineObject).orientation;
        
        if (orientation === 'horizontal') {
          // For horizontal line, only resize width
          switch(this.resizeHandle) {
            case 'e':
            case 'ne':
            case 'se':
              newWidth = Math.max(20, this.resizeStartWidth + deltaX);
              break;
            case 'w':
            case 'nw':
            case 'sw':
              newWidth = Math.max(20, this.resizeStartWidth - deltaX);
              leftOffset = parseInt(element.style.left || '0', 10) + deltaX;
              break;
          }
          
          // Ensure element has position relative
          element.style.position = 'relative';
          
          // Update element position
          element.style.left = `${leftOffset}px`;
          
          // Set new width
          line.style.width = `${newWidth}px`;
          // Reset height to maintain thickness
          line.style.height = `${(this.selectedObject as LineObject).thickness}px`;
          
        } else {
          // For vertical line, only resize height
          switch(this.resizeHandle) {
            case 'n':
            case 'ne':
            case 'nw':
              newHeight = Math.max(20, this.resizeStartHeight - deltaY);
              topOffset = parseInt(element.style.top || '0', 10) + deltaY;
              break;
            case 's':
            case 'se':
            case 'sw':
              newHeight = Math.max(20, this.resizeStartHeight + deltaY);
              break;
          }
          
          // Ensure element has position relative
          element.style.position = 'relative';
          
          // Update element position
          element.style.top = `${topOffset}px`;
          
          // Set new height
          line.style.height = `${newHeight}px`;
          // Reset width to maintain thickness
          line.style.width = `${(this.selectedObject as LineObject).thickness}px`;
        }
      }
      
      // Update object dimensions and position in the objects array
      this.selectedObject.width = newWidth;
      this.selectedObject.height = newHeight;
      this.selectedObject.x = leftOffset;
      this.selectedObject.y = topOffset;
      
      // Update resize handlers position
      this.updateResizeHandlersPosition();
      
    } else if (this.isRotating && this.selectedObject && this.selectedObject.element) {
      // Calculate center of object
      const rect = this.selectedObject.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate current angle
      const angleRadians = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const currentAngle = (angleRadians * 180 / Math.PI);
      
      // Calculate rotation change
      const angleDelta = currentAngle - this.rotateStartAngle;
      let newRotation = ((this.rotateStartX + angleDelta) % 360 + 360) % 360;
      
      // Apply rotation to element
      this.selectedObject.element.style.transform = `rotate(${newRotation}deg)`;
      
      // Update object rotation
      this.selectedObject.rotation = newRotation;
      
      // Update resize handlers position and rotation
      this.updateResizeHandlersPosition();
    }
  };
  
  // ====== MOUSE UP HANDLER ======
  
  handleMouseUp = (e: MouseEvent): void => {
    if (this.isDragging || this.isResizing || this.isRotating) {
      // End the operation
      if (this.selectedObject && this.selectedObject.element) {
        // Remove special classes
        this.selectedObject.element.classList.remove('dragging', 'resizing');
        
        // Update resize handlers position one final time
        this.updateResizeHandlersPosition();
      }
      
      this.isDragging = false;
      this.isResizing = false;
      this.isRotating = false;
      
      // Save state for undo
      this.saveToHistory();
      this.saveCurrentPageContent();
    }
  };

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
    
    // Delete key for selected objects
    if (e.key === 'Delete' && this.selectedObject && this.selectedObject.element) {
      e.preventDefault();
      
      // Remove the element from the DOM
      const element = this.selectedObject.element;
      const parent = element.parentElement;
      if (parent) {
        parent.removeChild(element);
        
        // If parent is empty or only has an empty <br>, remove it as well
        if (parent.innerHTML.trim() === '' || parent.innerHTML === '<br>') {
          parent.parentElement?.removeChild(parent);
        }
      }
      
      // Remove from objects array
      this.objects = this.objects.filter(obj => obj !== this.selectedObject);
      
      // Clear selection
      this.selectedObject = null;
      
      // Save state
      this.saveToHistory();
      this.saveCurrentPageContent();
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
        this.exportDetails = "HTML format exports the complete content as a web page with all formatting, styles, and images preserved.";
        break;
      case 'txt':
        this.exportDetails = "Plain text format that preserves only the text content without formatting.";
        break;
      case 'pdf':
        this.exportDetails = "PDF format for high-quality print documents that preserves all formatting, styles, and images exactly as they appear in the editor.";
        break;
    }
  }
  
  downloadExport(): void {
  let data = '';
  let filename = '';
  let mime = '';
  
  try {
    // Get form name for better file naming
    const formName = this.documentForm.get('name')?.value || 'document';
    const sanitizedName = formName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    switch(this.exportFormat) {
      case 'html':
        // Save current page first
        this.saveCurrentPageContent();
        
        data = this.generateHTML();
        filename = `${sanitizedName}.html`;
        mime = 'text/html';
        break;
      case 'txt':
        // Save current page first
        this.saveCurrentPageContent();
        
        // Combine all pages' plain text
        data = this.pages.map(page => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = page.content;
          return tempDiv.innerText;
        }).join('\n\n--- Page Break ---\n\n');
        
        filename = `${sanitizedName}.txt`;
        mime = 'text/plain';
        break;
      case 'pdf':
        this.generatePDF();
        return; // The PDF generation will handle the download
      default:
        this.notify('Invalid export format', 'error');
        return;
    }
    
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
  // Save current page content
  this.saveCurrentPageContent();
  
  // Get form information for metadata
  const formName = this.documentForm.get('name')?.value || 'Document';
  const language = this.documentForm.get('language')?.value || 'english';
  const pageLayout = this.documentForm.get('pagelayout')?.value || 'portrait';
  
  // Generate CSS for specific language
  const languageClass = language !== 'english' ? language : '';
  const languageFontFamily = this.getLanguageFontFamily(language);
  
  // Calculate page dimensions based on layout
  const pageWidth = pageLayout === 'portrait' ? '794px' : '1123px';
  const pageHeight = pageLayout === 'portrait' ? '1123px' : '794px';
  
  // Generate page content with preserved styles
  const pagesContent = this.pages.map((page, index) => {
    return `
      <div class="editor-page" id="page-${index + 1}">
        <div class="page-content ${languageClass}">${this.processPageContentForExport(page.content)}</div>
        <div class="page-number">Page ${index + 1}</div>
      </div>
    `;
  }).join('');
  
  // Create complete HTML document
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${formName}</title>
  <meta name="generator" content="Auro Editor">
  <style>
    /* Import fonts for English */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Montserrat:wght@400;500;700&display=swap');
    
    /* Import fonts for Tamil */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;700&family=Catamaran:wght@400;500;700&display=swap');
    
    /* Import fonts for Telugu */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;700&family=Baloo+Tammudu+2:wght@400;500;700&display=swap');
    
    /* Import fonts for Malayalam */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;500;700&family=Manjari:wght@400;700&display=swap');
    
    /* Import fonts for Hindi */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700&family=Poppins:wght@400;500;700&family=Hind:wght@400;500;700&display=swap');
    
    body { 
      margin: 0; 
      padding: 40px; 
      font-family: 'Inter', sans-serif;
      background-color: #f0f0f0;
    }
    
    .document-container {
      max-width: ${pageWidth};
      margin: 0 auto;
    }
    
    .editor-page {
      width: ${pageWidth};
      height: ${pageHeight};
      margin-bottom: 40px;
      background: white;
      position: relative;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      page-break-after: always;
      overflow: hidden;
    }
    
    .page-content {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 40px;
      box-sizing: border-box;
      font-family: ${languageFontFamily};
    }
    
    .page-number {
      position: absolute;
      bottom: 10px;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 12px;
      color: #6c757d;
    }
    
    /* Custom classes for each language */
    .tamil {
      font-family: 'Noto Sans Tamil', sans-serif;
      line-height: 1.6;
    }
    
    .telungu {
      font-family: 'Noto Sans Telugu', sans-serif;
      line-height: 1.6;
    }
    
    .malayalam {
      font-family: 'Noto Sans Malayalam', sans-serif;
      line-height: 1.6;
    }
    
    .hindi {
      font-family: 'Noto Sans Devanagari', sans-serif;
      line-height: 1.6;
    }
    
    /* Editor object styles */
    .img-container {
      display: inline-block;
      position: relative;
    }
    
    .editor-image {
      max-width: 100%;
      height: auto;
      display: block;
    }
    
    .line-container {
      display: inline-block;
      position: relative;
      text-align: center;
    }
    
    .editor-line {
      display: inline-block;
      background-color: #000000;
    }
    
    .field-placeholder {
      background-color: #e9f7fb;
      padding: 2px 4px;
      border-radius: 3px;
      margin: 0 2px;
      color: #0969da;
    }

    @media print {
      body {
        padding: 0;
        background-color: white;
      }
      
      .document-container {
        max-width: none;
      }
      
      .editor-page {
        margin: 0;
        box-shadow: none;
        page-break-after: always;
      }
      
      .editor-page:last-child {
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="document-container">
    ${pagesContent}
  </div>
  <script>
    // Add print button
    if (!window.location.search.includes('print=true')) {
      const printBtn = document.createElement('button');
      printBtn.innerText = 'Print';
      printBtn.style.position = 'fixed';
      printBtn.style.top = '20px';
      printBtn.style.right = '20px';
      printBtn.style.padding = '8px 16px';
      printBtn.style.background = '#4361ee';
      printBtn.style.color = 'white';
      printBtn.style.border = 'none';
      printBtn.style.borderRadius = '4px';
      printBtn.style.cursor = 'pointer';
      printBtn.addEventListener('click', () => {
        window.print();
      });
      document.body.appendChild(printBtn);
    } else {
      // Auto print if opened with print=true parameter
      window.addEventListener('load', () => {
        window.print();
      });
    }
  </script>
</body>
</html>`;
}
  
  getAllPagesContent(): string {
    return this.pages.map(page => 
      `<div class="editor-page">${page.content}</div>`
    ).join('');
  }

  processPageContentForExport(content: string): string {
  // Create a temporary container to process the content
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = content;
  
  // Process all image containers
  const imgContainers = tempContainer.querySelectorAll('.img-container');
  imgContainers.forEach(container => {
    // Remove any editor-specific classes or attributes that shouldn't be exported
    container.classList.remove('selected', 'dragging', 'resizing');
    
    // Ensure all positioning styles are preserved
    const img = container.querySelector('img');
    if (img) {
      // Make sure the img has its width and height explicitly set
      const imgRect = img.getBoundingClientRect();
      img.style.width = `${imgRect.width}px`;
      img.style.height = `${imgRect.height}px`;
    }
  });
  
  // Process all line containers
  const lineContainers = tempContainer.querySelectorAll('.line-container');
  lineContainers.forEach(container => {
    // Remove any editor-specific classes or attributes that shouldn't be exported
    container.classList.remove('selected', 'dragging', 'resizing');
    
    // Ensure all positioning styles are preserved
    const line = container.querySelector('.editor-line');
    if (line) {
      // Make sure the line has its styling explicitly set
      const orientation = container.getAttribute('data-orientation');
      const thickness = container.getAttribute('data-thickness') || '2';
      const color = container.getAttribute('data-color') || '#000000';
      
      if (orientation === 'horizontal') {
        (line as HTMLElement).style.height = `${thickness}px`;
      } else {
        (line as HTMLElement).style.width = `${thickness}px`;
      }
      (line as HTMLElement).style.backgroundColor = color;
    }
  });
  
  return tempContainer.innerHTML;
}

/**
 * Get the font family for the specified language
 */
getLanguageFontFamily(language: string): string {
  switch (language) {
    case 'tamil':
      return "'Noto Sans Tamil', sans-serif";
    case 'telungu':
      return "'Noto Sans Telugu', sans-serif";
    case 'malayalam':
      return "'Noto Sans Malayalam', sans-serif";
    case 'hindi':
      return "'Noto Sans Devanagari', sans-serif";
    case 'english':
    default:
      return "'Inter', sans-serif";
  }
}

/**
 * Generate and download PDF document
 */
generatePDF(): void {
  // Save current page first
  this.saveCurrentPageContent();
  
  // Get form name for better file naming
  const formName = this.documentForm.get('name')?.value || 'document';
  const sanitizedName = formName.toString().replace(/[^a-z0-9]/gi, '-').toLowerCase();
  
  try {
    // We'll use html2canvas and jsPDF for PDF generation
    // First, check if the libraries are already loaded
    if (typeof (window as any).html2canvas === 'undefined' || typeof (window as any).jspdf === 'undefined') {
      // Load the libraries dynamically if they're not available
      this.loadPdfLibraries().then(() => {
        // Once libraries are loaded, continue with PDF generation
        this.generatePdfWithLibraries(sanitizedName);
      }).catch(error => {
        this.notify('Failed to load PDF libraries: ' + error.message, 'error');
      });
    } else {
      // Libraries are already available, generate PDF
      this.generatePdfWithLibraries(sanitizedName);
    }
  } catch (error) {
    this.notify('PDF generation failed: ' + (error as Error).message, 'error');
  }
}

/**
 * Load the required libraries for PDF generation
 */
loadPdfLibraries(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create notification to show loading status
    this.notify('Loading PDF generation libraries...', 'warning');
    
    // Load html2canvas library
    const html2canvasScript = document.createElement('script');
    html2canvasScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    html2canvasScript.onload = () => {
      // After html2canvas is loaded, load jsPDF
      const jsPdfScript = document.createElement('script');
      jsPdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      jsPdfScript.onload = () => {
        // Both libraries are loaded
        this.notify('PDF libraries loaded successfully', 'success');
        resolve();
      };
      jsPdfScript.onerror = () => {
        reject(new Error('Failed to load jsPDF library'));
      };
      document.head.appendChild(jsPdfScript);
    };
    html2canvasScript.onerror = () => {
      reject(new Error('Failed to load html2canvas library'));
    };
    document.head.appendChild(html2canvasScript);
  });
}

/**
 * Generate PDF using loaded libraries
 */
generatePdfWithLibraries(filename: string): void {
  // First, create a temporary container with all pages
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.top = '-9999px';
  tempContainer.style.left = '-9999px';
  tempContainer.style.width = '794px'; // A4 width in pixels
  
  // Get page layout
  const pageLayout = this.documentForm.get('pagelayout')?.value || 'portrait';
  
  // Create jsPDF instance with correct orientation
  const jspdf = (window as any).jspdf;
  const html2canvas = (window as any).html2canvas;
  
  if (!jspdf || !html2canvas) {
    this.notify('PDF libraries not loaded properly', 'error');
    return;
  }
  
  const pdf = new jspdf.jsPDF({
    orientation: pageLayout.toString(),
    unit: 'px',
    format: 'a4',
    hotfixes: ['px_scaling']
  });
  
  // Process each page
  const processPage = (pageIndex: number) => {
    if (pageIndex >= this.pages.length) {
      // All pages processed, save the PDF
      pdf.save(`${filename}.pdf`);
      document.body.removeChild(tempContainer);
      this.showExportModal = false;
      this.notify('PDF export successful', 'success');
      return;
    }
    
    // Update notification
    this.notify(`Generating PDF: Processing page ${pageIndex + 1} of ${this.pages.length}`, 'warning');
    
    // Create page element
    const pageElement = document.createElement('div');
    pageElement.style.width = '794px'; // A4 width
    pageElement.style.height = '1123px'; // A4 height
    pageElement.style.position = 'relative';
    pageElement.style.backgroundColor = 'white';
    pageElement.style.padding = '40px';
    pageElement.style.boxSizing = 'border-box';
    pageElement.style.fontFamily = this.getLanguageFontFamily(this.currentLanguage);
    pageElement.innerHTML = this.processPageContentForExport(this.pages[pageIndex].content);
    
    // Clear the container and add the current page
    tempContainer.innerHTML = '';
    tempContainer.appendChild(pageElement);
    
    // Use html2canvas to render the page
    html2canvas(pageElement, {
      scale: 2, // Higher scale for better quality
      logging: false,
      useCORS: true, // Enable CORS for images
      allowTaint: true
    }).then((canvas: HTMLCanvasElement) => {
      // Add page to PDF (except first page which is added by default)
      if (pageIndex > 0) {
        pdf.addPage();
      }
      
      // Get canvas as an image
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // Calculate dimensions to fit the page
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Add the image to the PDF
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      
      // Process next page
      processPage(pageIndex + 1);
    }).catch((error: Error) => {
      document.body.removeChild(tempContainer);
      this.notify('PDF generation error: ' + error.message, 'error');
    });
  };
  
  // Start processing from the first page
  document.body.appendChild(tempContainer);
  processPage(0);
}

  
  // ====== NOTIFICATION SYSTEM ======
  
  notify(message: string, type: 'success' | 'warning' | 'error'): void {
    this.notification = message;
    this.notificationType = type;
    this.showNotification = true;
    
    setTimeout(() => {
      this.showNotification = false;
    }, 3000);
  }

  // ====== FORM SUBMISSION ======
  
  onSubmit(): void {
    if (this.documentForm.valid) {
      this.saveCurrentPageContent();
      
      const allPagesContent = this.getAllPagesContent();
      this.documentForm.patchValue({ content: allPagesContent });

      let finalData = {
        ...this.documentForm.value, 
        isactive: true,
      };
      
      this.http.post('https://localhost:7092/api/forms', finalData)
      .subscribe({
        next: (response) => {
          console.log('API Success:', response);
          this.notify('Form submitted successfully', 'success');
        },
        error: (error) => {
          console.error('API Error:', error);
          this.notify('Failed to submit form', 'error');
        }
      });
    } else {
      this.notify('Please fill in all required fields', 'error');
    }
  }
}