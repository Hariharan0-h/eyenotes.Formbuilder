import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, Renderer2, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

type SupportedLanguage = 'english' | 'tamil' | 'telungu' | 'malayalam' | 'hindi';

interface EditorObject {
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

interface ImageObject extends EditorObject {
  src: string;
}

interface LineObject extends EditorObject {
  orientation: 'horizontal' | 'vertical';
  thickness: number;
  color: string;
}

interface TableObject extends EditorObject {
  rows: number;
  columns: number;
  borderStyle: string;
  borderWidth: number;
}

interface EditorPage {
  id: number;
  content: string;
  hasBorder?: boolean;
  borderStyle?: string;
  borderWidth?: number;
  borderColor?: string;
}

@Component({
  selector: 'app-auro-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './auro-editor.component.html',
  styleUrls: ['./auro-editor.component.css']
})
export class AuroEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasContent') canvasContent!: ElementRef;
  @ViewChild('colorInput') colorInput!: ElementRef;
  @ViewChild('fieldDropdownSelect') fieldDropdownSelect!: ElementRef;
  
  // Form subscriptions
  private subscriptions: Subscription[] = [];
  
  // Objects management
  objects: EditorObject[] = [];
  selectedObject: EditorObject | null = null;
  nextId = 1;

  // Minimum dimensions for resizing
  minResizeWidth = 20;
  minResizeHeight = 20;
  
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

  // Table related properties
  tableRows = 3;
  tableColumns = 3;
  tableBorderStyle = 'solid';
  tableBorderWidth = 1;
  selectedTableCell: HTMLTableCellElement | null = null;
  isTableCellResizing = false;
  tableCellResizeDirection = '';
  tableCellResizeStartX = 0;
  tableCellResizeStartY = 0;
  tableCellResizeStartWidth = 0;
  tableCellResizeStartHeight = 0;
  showTableModal = false;

  // Field dropdown
  showFieldDropdown = false;
  fieldDropdownPosition = { top: '0px', left: '0px' };
  lastCursorPosition: Range | null = null;

  // Zoom level
  zoom = 100;
  
  // Form and UI state
  documentForm!: FormGroup;
  showFormFields = true;
  
  // Line properties
  lineThickness = 2;
  lineColor = '#000000';
  
  // Pages
  pages: EditorPage[] = [];
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
  currentBorderWidth = 1;
  currentBorderColor = '#000000';
  
  // Undo/Redo history
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  
  // Notification
  notification = '';
  notificationType: 'success' | 'warning' | 'error' = 'success';
  showNotification = false;
  
  // Image modal
  showImageModal = false;

  // Paper sizes in pixels (at 96 DPI)
  paperSizes: {[key: string]: {width: number, height: number}} = {
    'A4': {width: 794, height: 1123},      // 210mm x 297mm
    'A5': {width: 559, height: 794},       // 148mm x 210mm
    'Letter': {width: 816, height: 1056},  // 8.5in x 11in
    'Legal': {width: 816, height: 1344},   // 8.5in x 14in
    'Tabloid': {width: 1056, height: 1632} // 11in x 17in
  };

  // Language specific font mappings
  languageFontMap: Record<SupportedLanguage, string[]> = {
    english: ['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Montserrat'],
    tamil: ['Noto Sans Tamil', 'Latha', 'Vijaya', 'Kavivanar', 'Catamaran', 'Meera'],
    telungu: ['Noto Sans Telugu', 'Gautami', 'Telugu Sangam MN', 'Baloo Tammudu 2', 'Mandali', 'NTR'],
    malayalam: ['Noto Sans Malayalam', 'Manjari', 'Chilanka', 'Gayathri', 'Keraleeyam', 'Baloo Chettan 2'],
    hindi: ['Noto Sans Devanagari', 'Poppins', 'Hind', 'Kalam', 'Teko', 'Karma']
  };

  // Font sizes for complex scripts
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
    this.initForm();
    this.initFirstPage();
    this.initFontOptions();
    this.setupFormSubscriptions();
  }

  initForm(): void {
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
  }

  initFirstPage(): void {
    this.pages = [{
      id: new Date().getTime(),
      content: '<p></p>',
      hasBorder: false,
      borderStyle: 'solid',
      borderWidth: 1,
      borderColor: '#000000'
    }];
  }

  initFontOptions(): void {
    this.availableFonts = [...this.languageFontMap.english];
    this.availableFontSizes = [...this.languageFontSizes.english];
  }

  setupFormSubscriptions(): void {
    // Language change subscription
    const languageControl = this.documentForm.get('language');
    if (languageControl) {
      this.subscriptions.push(
        languageControl.valueChanges.subscribe((lang: string) => {
          this.updateLanguageFonts();
        })
      );
    }

    // Paper size, layout and margin subscriptions
    const layoutChangeControls = ['paperSize', 'pagelayout', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight'];
    layoutChangeControls.forEach(field => {
      const control = this.documentForm.get(field);
      if (control) {
        this.subscriptions.push(
          control.valueChanges.subscribe(() => {
            this.adjustCanvasDimensions();
          })
        );
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupEditor();
    this.saveToHistory();
    this.adjustCanvasDimensions();
    
    // Setup global mouse event handlers
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }
  
  ngOnDestroy(): void {
    // Clean up event listeners
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    
    // Unsubscribe from all form subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // ===== EDITOR SETUP AND CANVAS DIMENSIONS =====
  
  setupEditor(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    this.canvasContent.nativeElement.innerHTML = this.pages[this.currentPageIndex].content;
    this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
    this.loadCurrentPageBorderSettings();
    this.applyBorderToCurrentPage();
    this.canvasContent.nativeElement.focus();
    this.setupObjectHandlers();
    
    // Add input handler for detecting {{
    this.canvasContent.nativeElement.addEventListener('input', this.handleCanvasInput.bind(this));
    this.canvasContent.nativeElement.addEventListener('keyup', this.checkForFieldTrigger.bind(this));
  }

  adjustCanvasDimensions(): void {
    // Get form values
    const paperSize = this.documentForm.get('paperSize')?.value || 'A4';
    const pageLayout = this.documentForm.get('pagelayout')?.value || 'portrait';
    const marginTop = this.documentForm.get('marginTop')?.value || 1.27;
    const marginBottom = this.documentForm.get('marginBottom')?.value || 1.27;
    const marginLeft = this.documentForm.get('marginLeft')?.value || 1.27;
    const marginRight = this.documentForm.get('marginRight')?.value || 1.27;
    
    // Get dimensions for the selected paper size
    let dimensions = this.getPaperDimensions(paperSize);
    
    // Set dimensions based on orientation
    let width, height;
    if (pageLayout === 'portrait') {
      width = dimensions.width;
      height = dimensions.height;
    } else { // landscape
      width = dimensions.height;
      height = dimensions.width;
    }
    
    // Convert margins from cm to pixels (1cm ≈ 37.8px at 96 DPI)
    const pxPerCm = 37.8;
    const marginTopPx = marginTop * pxPerCm;
    const marginBottomPx = marginBottom * pxPerCm;
    const marginLeftPx = marginLeft * pxPerCm;
    const marginRightPx = marginRight * pxPerCm;
    
    // Apply to all editor elements
    this.applyDimensionsToAllEditors(width, height, marginTopPx, marginRightPx, marginBottomPx, marginLeftPx);
    
    // Reset any selection to refresh positions
    this.resetSelection();
  }

  getPaperDimensions(paperSize: string): { width: number, height: number } {
    // Check if it's a custom size or predefined
    if (paperSize.includes('x')) {
      try {
        // Parse custom size (e.g., "400x600")
        const parts = paperSize.split('x');
        const width = parseInt(parts[0].trim(), 10);
        const height = parseInt(parts[1].trim(), 10);
        
        if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
          return { width, height };
        }
      } catch (e) {
        console.error('Error parsing custom paper size:', e);
      }
    }
    
    // Return the predefined size or default to A4
    return this.paperSizes[paperSize] || this.paperSizes['A4'];
  }

  applyDimensionsToAllEditors(width: number, height: number, marginTop: number, marginRight: number, marginBottom: number, marginLeft: number): void {
    // Get all editor elements
    const editors = document.querySelectorAll('.editor');
    
    // Apply dimensions and margins to all editors
    editors.forEach(editor => {
      (editor as HTMLElement).style.width = `${width}px`;
      (editor as HTMLElement).style.height = `${height}px`;
      
      const canvasContent = editor.querySelector('.canvas-content');
      if (canvasContent) {
        (canvasContent as HTMLElement).style.padding = 
          `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
        this.updateMarginGuides(editor as HTMLElement, marginTop, marginRight, marginBottom, marginLeft);
      }
    });
    
    // Update add page button container width
    const addPageContainer = document.querySelector('.add-page-container');
    if (addPageContainer) {
      (addPageContainer as HTMLElement).style.maxWidth = `${width}px`;
    }
  }

  resetSelection(): void {
    if (this.selectedObject) {
      this.selectedObject = null;
      const selectedElements = document.querySelectorAll('.selected');
      selectedElements.forEach(el => el.classList.remove('selected'));
    }
  }

  updateMarginGuides(editor: HTMLElement, top: number, right: number, bottom: number, left: number): void {
    // Remove any existing margin guides
    const existingGuides = editor.querySelectorAll('.margin-guide');
    existingGuides.forEach(guide => guide.remove());
    
    // Create container for guides if it doesn't exist
    let container = editor.querySelector('.margin-guides-container') as HTMLElement;
    if (!container) {
      container = document.createElement('div');
      container.className = 'margin-guides-container';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '1';
      editor.appendChild(container);
    } else {
      // Clear existing guides
      container.innerHTML = '';
    }
    
    // Create guide positions
    const guidePositions = [
      { className: 'margin-guide top', style: { top: `${top}px`, left: '0', width: '100%', height: '1px' } },
      { className: 'margin-guide right', style: { top: '0', right: `${right}px`, width: '1px', height: '100%' } },
      { className: 'margin-guide bottom', style: { bottom: `${bottom}px`, left: '0', width: '100%', height: '1px' } },
      { className: 'margin-guide left', style: { top: '0', left: `${left}px`, width: '1px', height: '100%' } }
    ];
    
    // Create and append guides
    guidePositions.forEach(pos => {
      const guide = document.createElement('div');
      guide.className = pos.className;
      guide.style.position = 'absolute';
      Object.assign(guide.style, pos.style);
      guide.style.backgroundColor = 'rgba(67, 97, 238, 0.2)';
      container.appendChild(guide);
    });
  }

  updateLanguageFonts(): void {
    // Get the selected language from the form
    const formLang = this.documentForm.get('language')?.value;
    const lang = (formLang && 
      ['english', 'tamil', 'telungu', 'malayalam', 'hindi'].includes(formLang)) 
      ? formLang as SupportedLanguage 
      : 'english';
    
    this.currentLanguage = lang;
    
    // Update font options
    this.availableFonts = this.languageFontMap[lang];
    this.availableFontSizes = this.languageFontSizes[lang];
    
    // Update current font family if needed
    if (!this.availableFonts.includes(this.currentFontFamily)) {
      this.currentFontFamily = this.availableFonts[0];
      if (this.isSelectionInEditor()) {
        this.applyTextFormatting('fontName', this.currentFontFamily);
      }
    }
    
    // Update font size if needed
    const minFontSize = parseInt(this.availableFontSizes[0], 10);
    if (parseInt(this.currentFontSize, 10) < minFontSize) {
      this.currentFontSize = minFontSize.toString();
      if (this.isSelectionInEditor()) {
        this.applyTextFormatting('fontSize', this.currentFontSize);
      }
    }
    
    // Update editor language attribute
    if (this.canvasContent && this.canvasContent.nativeElement) {
      this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
    }
    
    this.notify(`Font settings updated for ${lang}`, 'success');
  }

  // ===== PAGE MANAGEMENT =====
  
  addPage(): void {
    this.saveCurrentPageContent();
    
    const newPage: EditorPage = {
      id: new Date().getTime(),
      content: '<p></p>',
      hasBorder: this.showBorder,
      borderStyle: this.currentBorderStyle,
      borderWidth: this.currentBorderWidth,
      borderColor: this.currentBorderColor
    };
    
    this.pages.push(newPage);
    this.currentPageIndex = this.pages.length - 1;
    
    // Defer setting content until after view is updated
    setTimeout(() => {
      if (this.canvasContent && this.canvasContent.nativeElement) {
        this.canvasContent.nativeElement.innerHTML = this.pages[this.currentPageIndex].content;
        this.canvasContent.nativeElement.setAttribute('data-language', this.currentLanguage);
        this.applyBorderToCurrentPage();
        this.canvasContent.nativeElement.focus();
        this.setupObjectHandlers();
        
        // Apply canvas dimensions to the new page
        this.adjustCanvasDimensions();
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
        this.loadCurrentPageBorderSettings();
        this.applyBorderToCurrentPage();
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
        
        // Load border settings from the page data
        this.loadCurrentPageBorderSettings();
        this.applyBorderToCurrentPage();
        
        this.canvasContent.nativeElement.focus();
        this.setupObjectHandlers();
      }
    });
  }

  saveCurrentPageContent(): void {
    if (this.canvasContent && this.canvasContent.nativeElement) {
      this.pages[this.currentPageIndex].content = this.canvasContent.nativeElement.innerHTML;
      // Save border settings too
      this.pages[this.currentPageIndex].hasBorder = this.showBorder;
      this.pages[this.currentPageIndex].borderStyle = this.currentBorderStyle;
      this.pages[this.currentPageIndex].borderWidth = this.currentBorderWidth;
      this.pages[this.currentPageIndex].borderColor = this.currentBorderColor;
    }
  }
  
  // ===== BORDER HANDLING =====
  
  loadCurrentPageBorderSettings(): void {
    const page = this.pages[this.currentPageIndex];
    this.showBorder = page.hasBorder || false;
    this.currentBorderStyle = page.borderStyle || 'solid';
    this.currentBorderWidth = page.borderWidth || 1;
    this.currentBorderColor = page.borderColor || '#000000';
  }

  applyBorderToCurrentPage(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    const element = this.canvasContent.nativeElement;
    
    if (this.showBorder) {
      // Get the margin values
      const marginTop = this.documentForm.get('marginTop')?.value || 1.27;
      const marginRight = this.documentForm.get('marginRight')?.value || 1.27;
      const marginBottom = this.documentForm.get('marginBottom')?.value || 1.27;
      const marginLeft = this.documentForm.get('marginLeft')?.value || 1.27;
      
      // Convert to pixels
      const pxPerCm = 37.8;
      const marginTopPx = marginTop * pxPerCm;
      const marginRightPx = marginRight * pxPerCm;
      const marginBottomPx = marginBottom * pxPerCm;
      const marginLeftPx = marginLeft * pxPerCm;
      
      // Add the 'with-border' class for the ::after pseudo-element
      element.classList.add('with-border');
      
      // Apply margin-positioned border using ::after pseudo-element
      const borderOverlay = document.createElement('div');
      borderOverlay.className = 'border-overlay';
      borderOverlay.style.top = `${marginTopPx}px`;
      borderOverlay.style.right = `${marginRightPx}px`;
      borderOverlay.style.bottom = `${marginBottomPx}px`;
      borderOverlay.style.left = `${marginLeftPx}px`;
      borderOverlay.style.border = `${this.currentBorderWidth}px ${this.currentBorderStyle} ${this.currentBorderColor}`;
      
      // Remove existing border overlay if any
      const existingOverlay = element.querySelector('.border-overlay');
      if (existingOverlay) {
        element.removeChild(existingOverlay);
      }
      
      element.appendChild(borderOverlay);
    } else {
      // Remove border and overlay
      element.classList.remove('with-border');
      const existingOverlay = element.querySelector('.border-overlay');
      if (existingOverlay) {
        element.removeChild(existingOverlay);
      }
    }
  }

  toggleBorder(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.showBorder = checkbox.checked;
    
    if (!this.canvasContent?.nativeElement) return;
    
    this.saveToHistory();
    
    this.applyBorderToCurrentPage();
    
    // Update border state for current page
    this.pages[this.currentPageIndex].hasBorder = this.showBorder;
    this.pages[this.currentPageIndex].borderStyle = this.currentBorderStyle;
    this.pages[this.currentPageIndex].borderWidth = this.currentBorderWidth;
    this.pages[this.currentPageIndex].borderColor = this.currentBorderColor;
    
    this.notify(`Page border ${this.showBorder ? 'added' : 'removed'}`, 'success');
    this.saveCurrentPageContent();
  }

  setBorderStyle(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select?.value) return;
    
    this.currentBorderStyle = select.value;
    
    // If border is not currently shown, don't apply anything
    if (!this.showBorder || !this.canvasContent?.nativeElement) return;
    
    this.saveToHistory();
    
    // Apply the border style to the current page
    this.applyBorderToCurrentPage();
    
    // Update border style for current page
    this.pages[this.currentPageIndex].borderStyle = this.currentBorderStyle;
    
    this.notify(`Page border style updated to ${this.currentBorderStyle}`, 'success');
    this.saveCurrentPageContent();
  }

 setBorderWidth(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input?.value) return;
    
    const width = parseInt(input.value, 10);
    this.currentBorderWidth = width;
    
    if (!this.showBorder || !this.canvasContent?.nativeElement) return;
    
    this.saveToHistory();
    
    // Apply the border width to the current page
    this.applyBorderToCurrentPage();
    
    // Update border width for current page
    this.pages[this.currentPageIndex].borderWidth = this.currentBorderWidth;
    
    this.notify(`Page border width updated to ${this.currentBorderWidth}px`, 'success');
    this.saveCurrentPageContent();
  }

  setBorderColor(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input?.value) return;
    
    this.currentBorderColor = input.value;
    
    if (!this.showBorder || !this.canvasContent?.nativeElement) return;
    
    this.saveToHistory();
    
    // Apply the border color to the current page
    this.applyBorderToCurrentPage();
    
    // Update border color for current page
    this.pages[this.currentPageIndex].borderColor = this.currentBorderColor;
    
    this.notify(`Page border color updated`, 'success');
    this.saveCurrentPageContent();
  }

  // ===== OBJECT HANDLERS =====
  
  setupObjectHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Reset objects array for current page
    this.objects = [];
    
    // Setup handlers for editor objects
    this.setupImageHandlers();
    this.setupLineHandlers();
    this.setupTableHandlers();
    
    // Deselect on click outside
    this.canvasContent.nativeElement.addEventListener('click', (e: MouseEvent) => {
      if (e.target === this.canvasContent.nativeElement) {
        this.selectedObject = null;
        this.selectedTableCell = null;
      }
    });
  }
  
  setupImageHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Find all img containers
    const imgContainers = this.canvasContent.nativeElement.querySelectorAll('.img-container');
    
    imgContainers.forEach((container: HTMLElement) => {
      // To avoid duplicate listeners, clone and replace
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
      
      // Register the image in our objects array
      this.registerImageObject(newContainer);
    });
  }
  
  registerImageObject(container: HTMLElement): void {
    const imgElement = container.querySelector('img');
    if (!imgElement) return;
    
    const rect = container.getBoundingClientRect();
    
    // Check if this image is already registered
    const existingObj = this.objects.find(obj => 
      obj.element === container || 
      (obj as ImageObject).src === imgElement.src
    );
    
    if (existingObj) {
      existingObj.element = container;
      existingObj.width = rect.width;
      existingObj.height = rect.height;
    } else {
      // Create and register new object
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
        element: container
      };
      this.objects.push(newObj);
    }
  }
  
  setupLineHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Find all line containers
    const lineContainers = this.canvasContent.nativeElement.querySelectorAll('.line-container');
    
    lineContainers.forEach((container: HTMLElement) => {
      // Clone to avoid duplicate listeners
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
          e.preventDefault();
          this.startDrag(e, newContainer);
        }
      });
      
      // Register the line in our objects array
      this.registerLineObject(newContainer);
    });
  }
  
  registerLineObject(container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    const orientation = container.getAttribute('data-orientation') as 'horizontal' | 'vertical';
    const thickness = parseInt(container.getAttribute('data-thickness') || '2');
    const color = container.getAttribute('data-color') || '#000000';
    
    // Check if already registered
    const existingObj = this.objects.find(obj => obj.element === container);
    
    if (existingObj && existingObj.type === 'line') {
      existingObj.element = container;
      existingObj.width = rect.width;
      existingObj.height = rect.height;
      (existingObj as LineObject).orientation = orientation;
      (existingObj as LineObject).thickness = thickness;
      (existingObj as LineObject).color = color;
    } else {
      // Create and register new object
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
        element: container
      };
      this.objects.push(newObj);
    }
  }
  
  setupTableHandlers(): void {
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Find all tables
    const tables = this.canvasContent.nativeElement.querySelectorAll('.editor-table');
    
    tables.forEach((table: HTMLTableElement) => {
      // Add handler to make the table draggable
      table.addEventListener('mousedown', (e) => {
        if (e.target === table || (e.target as HTMLElement).tagName === 'TABLE') {
          e.preventDefault();
          e.stopPropagation();
          
          // Select the table first
          this.selectObject(table, 'table');
          this.startDrag(e, table);
        }
      });
      
      // Add cell selection handlers
      const cells = table.querySelectorAll('td');
      cells.forEach((cell: HTMLTableCellElement) => {
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectTableCell(cell);
        });
      });
      
      // Register the table in our objects array
      this.registerTableObject(table);
    });
  }

  registerTableObject(table: HTMLTableElement): void {
    const rect = table.getBoundingClientRect();
    
    // Extract table properties
    const rows = table.rows.length;
    const columns = table.rows[0]?.cells.length || 0;
    
    const computedStyle = window.getComputedStyle(table);
    const borderStyle = computedStyle.borderStyle || 'solid';
    const borderWidth = parseInt(computedStyle.borderWidth || '1', 10);
    
    // Check if already registered
    const existingObj = this.objects.find(obj => obj.element === table && obj.type === 'table');
    
    if (existingObj && existingObj.type === 'table') {
      existingObj.width = rect.width;
      existingObj.height = rect.height;
      (existingObj as TableObject).rows = rows;
      (existingObj as TableObject).columns = columns;
      (existingObj as TableObject).borderStyle = borderStyle;
      (existingObj as TableObject).borderWidth = borderWidth;
    } else {
      // Create and register new object
      const newObj: TableObject = {
        id: this.generateId(),
        type: 'table',
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        zIndex: this.objects.length + 1,
        rotation: 0,
        rows: rows,
        columns: columns,
        borderStyle: borderStyle,
        borderWidth: borderWidth,
        element: table
      };
      this.objects.push(newObj);
    }
  }

  selectTableCell(cell: HTMLTableCellElement): void {
    // Clear previous selection
    const previouslySelected = document.querySelectorAll('.table-cell.selected');
    previouslySelected.forEach(selected => {
      selected.classList.remove('selected');
    });
    
    // Mark this cell as selected
    cell.classList.add('selected');
    this.selectedTableCell = cell;
    
    // Position the resize controls
    this.updateTableCellResizeHandlersPosition();
  }

  updateTableCellResizeHandlersPosition(): void {
    if (!this.selectedTableCell) return;
    
    const rect = this.selectedTableCell.getBoundingClientRect();
    
    // Get the resize controls container
    const resizeControls = document.querySelector('.table-cell-resize-controls') as HTMLElement;
    if (!resizeControls) return;
    
    // Position the resize controls
    resizeControls.style.top = `${rect.top}px`;
    resizeControls.style.left = `${rect.left}px`;
    resizeControls.style.width = `${rect.width}px`;
    resizeControls.style.height = `${rect.height}px`;
  }

  startTableCellResize(e: MouseEvent, direction: string): void {
    if (!this.selectedTableCell) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    this.isTableCellResizing = true;
    this.tableCellResizeDirection = direction;
    this.tableCellResizeStartX = e.clientX;
    this.tableCellResizeStartY = e.clientY;
    
    const rect = this.selectedTableCell.getBoundingClientRect();
    this.tableCellResizeStartWidth = rect.width;
    this.tableCellResizeStartHeight = rect.height;
    
    // Add a class to indicate resizing
    this.selectedTableCell.classList.add('resizing');
  }

  handleTableCellResize(e: MouseEvent): void {
    if (!this.isTableCellResizing || !this.selectedTableCell) return;
    
    const deltaX = e.clientX - this.tableCellResizeStartX;
    const deltaY = e.clientY - this.tableCellResizeStartY;
    
    // Apply zoom correction
    const zoomFactor = this.zoom / 100;
    const scaledDeltaX = deltaX / zoomFactor;
    const scaledDeltaY = deltaY / zoomFactor;
    
    // Calculate new dimensions
    let newWidth = this.tableCellResizeStartWidth;
    let newHeight = this.tableCellResizeStartHeight;
    
    if (this.tableCellResizeDirection === 'right') {
      newWidth = Math.max(30, this.tableCellResizeStartWidth + scaledDeltaX);
      this.selectedTableCell.style.width = `${newWidth}px`;
    } else if (this.tableCellResizeDirection === 'bottom') {
      newHeight = Math.max(20, this.tableCellResizeStartHeight + scaledDeltaY);
      this.selectedTableCell.style.height = `${newHeight}px`;
    }
    
    // Update resize handlers position
    this.updateTableCellResizeHandlersPosition();
  }

  endTableCellResize(): void {
    if (!this.isTableCellResizing || !this.selectedTableCell) return;
    
    this.isTableCellResizing = false;
    this.selectedTableCell.classList.remove('resizing');
    
    // Save state for undo
    this.saveToHistory();
    this.saveCurrentPageContent();
  }
  
  selectObject(element: HTMLElement, type: string, orientation?: 'horizontal' | 'vertical'): void {
    // Clear table cell selection if any
    this.selectedTableCell = null;
    const previouslySelectedCells = document.querySelectorAll('.table-cell.selected');
    previouslySelectedCells.forEach(cell => cell.classList.remove('selected'));
    
    // Find the corresponding object
    const obj = this.objects.find(o => o.element === element);
    
    if (obj) {
      this.selectedObject = obj;
      
      // Add selected class to the element
      element.classList.add('selected');
      
      // Remove selected class from all other elements
      const selectors = ['.img-container', '.line-container', '.editor-table'];
      selectors.forEach(selector => {
        const allElements = this.canvasContent.nativeElement.querySelectorAll(selector);
        allElements.forEach((el: HTMLElement) => {
          if (el !== element) {
            el.classList.remove('selected');
          }
        });
      });
      
      // Update the position of resize handlers after selection
      setTimeout(() => this.updateResizeHandlersPosition(), 0);
    }
  }
  
  // ===== OBJECT MANIPULATION =====
  
  selectedObjectIsSmall(): boolean {
    if (!this.selectedObject || !this.selectedObject.element) return false;
    
    const rect = this.selectedObject.element.getBoundingClientRect();
    // Consider "small" if either dimension is less than 80px
    return rect.width < 80 || rect.height < 80;
  }

  selectedObjectIsTiny(): boolean {
    if (!this.selectedObject || !this.selectedObject.element) return false;
    
    const rect = this.selectedObject.element.getBoundingClientRect();
    // Consider "tiny" if either dimension is less than 40px
    return rect.width < 40 || rect.height < 40;
  }
  
  updateResizeHandlersPosition(): void {
    if (!this.selectedObject || !this.selectedObject.element) return;
    
    const element = this.selectedObject.element;
    const rect = element.getBoundingClientRect();
    
    // Get the resize controls container
    const resizeControls = document.querySelector('.resize-controls') as HTMLElement;
    if (!resizeControls) return;
    
    // Position the resize controls container
    resizeControls.style.top = `${rect.top}px`;
    resizeControls.style.left = `${rect.left}px`;
    resizeControls.style.width = `${rect.width}px`;
    resizeControls.style.height = `${rect.height}px`;
    
    // Apply rotation if any
    if (this.selectedObject.rotation) {
      resizeControls.style.transform = `rotate(${this.selectedObject.rotation}deg)`;
      resizeControls.style.transformOrigin = 'center center';
    } else {
      resizeControls.style.transform = '';
    }
    
    // Apply size-based classes
    resizeControls.classList.toggle('small-element', this.selectedObjectIsSmall());
    resizeControls.classList.toggle('tiny-element', this.selectedObjectIsTiny());
    
    // Adjust rotate handle for tiny elements
    if (this.selectedObjectIsTiny()) {
      const rotateHandle = resizeControls.querySelector('.rotate-handle') as HTMLElement;
      if (rotateHandle) {
        rotateHandle.style.top = '-18px';
      }
    }
  }
  
  startDrag(e: MouseEvent, element: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    
    // Find or select the object
    const obj = this.objects.find(o => o.element === element);
    if (!obj) return;
    
    // Select this object if not already selected
    if (this.selectedObject !== obj) {
      if (obj.type === 'image') {
        this.selectObject(element, 'image');
      } else if (obj.type === 'line') {
        const orientation = element.getAttribute('data-orientation') as 'horizontal' | 'vertical';
        this.selectObject(element, 'line', orientation);
      } else if (obj.type === 'table') {
        this.selectObject(element, 'table');
      }
    }
    
    // Ensure element has the right CSS setup for dragging
    element.style.position = 'relative';
    
    // Store drag start information
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    
    // Get current position from style
    const left = parseInt(element.style.left || '0', 10);
    const top = parseInt(element.style.top || '0', 10);
    
    this.dragStartObjX = left;
    this.dragStartObjY = top;
    
    // Add dragging class
    element.classList.add('dragging');
  }
  
  startResize(e: MouseEvent, handle: string): void {
    e.preventDefault();
    e.stopPropagation();
    
    if (!this.selectedObject || !this.selectedObject.element) return;
    
    // Initialize resizing state
    this.isResizing = true;
    this.resizeHandle = handle;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    
    const element = this.selectedObject.element;
    const rect = element.getBoundingClientRect();
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;
    
    // Store current position for accurate resizing
    this.dragStartObjX = parseInt(element.style.left || '0', 10);
    this.dragStartObjY = parseInt(element.style.top || '0', 10);
    
    // Set minimum dimensions based on object type
    this.minResizeWidth = this.selectedObject.type === 'image' ? 30 : 20;
    this.minResizeHeight = this.selectedObject.type === 'image' ? 30 : 20;
    
    // Add resizing class
    element.classList.add('resizing');
  }
  
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
  
  handleMouseMove = (e: MouseEvent): void => {
    // Handle table cell resizing if active
    if (this.isTableCellResizing) {
      this.handleTableCellResize(e);
      return;
    }
    
    if (this.isDragging && this.selectedObject && this.selectedObject.element) {
      this.handleDragMove(e);
    } else if (this.isResizing && this.selectedObject && this.selectedObject.element) {
      this.handleResizeMove(e);
    } else if (this.isRotating && this.selectedObject && this.selectedObject.element) {
      this.handleRotateMove(e);
    }
  };
  
  handleDragMove(e: MouseEvent): void {
    // Calculate the new position with zoom correction
    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;
    const zoomFactor = this.zoom / 100;
    const scaledDeltaX = deltaX / zoomFactor;
    const scaledDeltaY = deltaY / zoomFactor;
    
    const newX = this.dragStartObjX + scaledDeltaX;
    const newY = this.dragStartObjY + scaledDeltaY;
    
    // Update the element's position
    const element = this.selectedObject!.element!;
    element.style.position = 'relative';
    element.style.left = `${newX}px`;
    element.style.top = `${newY}px`;
    
    // Update object coordinates
    this.selectedObject!.x = newX;
    this.selectedObject!.y = newY;
    
    // Update resize handlers position
    this.updateResizeHandlersPosition();
  }
  
  handleResizeMove(e: MouseEvent): void {
    // Calculate deltas with zoom correction
    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;
    const zoomFactor = this.zoom / 100;
    const scaledDeltaX = deltaX / zoomFactor;
    const scaledDeltaY = deltaY / zoomFactor;
    
    // Get the element
    const element = this.selectedObject!.element!;
    
    // Base values
    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let leftOffset = this.dragStartObjX;
    let topOffset = this.dragStartObjY;
    
    // Handle resize based on object type
    switch (this.selectedObject!.type) {
      case 'image':
        this.resizeImage(element, scaledDeltaX, scaledDeltaY, leftOffset, topOffset, newWidth, newHeight);
        break;
      case 'line':
        this.resizeLine(element, scaledDeltaX, scaledDeltaY, leftOffset, topOffset, newWidth, newHeight);
        break;
      case 'table':
        this.resizeTable(element, scaledDeltaX, scaledDeltaY, leftOffset, topOffset, newWidth, newHeight);
        break;
    }
    
    // Update resize handlers position
    this.updateResizeHandlersPosition();
  }
  
  resizeImage(element: HTMLElement, scaledDeltaX: number, scaledDeltaY: number, leftOffset: number, topOffset: number, newWidth: number, newHeight: number): void {
    const img = element.querySelector('img');
    if (!img) return;
    
    // Handle each resize direction
    switch(this.resizeHandle) {
      case 'se':
        newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth + scaledDeltaX);
        newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight + scaledDeltaY);
        break;
      case 'sw':
        newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth - scaledDeltaX);
        newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight + scaledDeltaY);
        leftOffset = this.dragStartObjX + scaledDeltaX;
        // Adjust offset if minimum width reached
        if (newWidth === this.minResizeWidth) {
          leftOffset = this.dragStartObjX + (this.resizeStartWidth - this.minResizeWidth);
        }
        break;
      case 'ne':
        newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth + scaledDeltaX);
        newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight - scaledDeltaY);
        topOffset = this.dragStartObjY + scaledDeltaY;
        // Adjust offset if minimum height reached
        if (newHeight === this.minResizeHeight) {
          topOffset = this.dragStartObjY + (this.resizeStartHeight - this.minResizeHeight);
        }
        break;
      case 'nw':
        newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth - scaledDeltaX);
        newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight - scaledDeltaY);
        leftOffset = this.dragStartObjX + scaledDeltaX;
        topOffset = this.dragStartObjY + scaledDeltaY;
        // Adjust offsets if minimum dimensions reached
        if (newWidth === this.minResizeWidth) {
          leftOffset = this.dragStartObjX + (this.resizeStartWidth - this.minResizeWidth);
        }
        if (newHeight === this.minResizeHeight) {
          topOffset = this.dragStartObjY + (this.resizeStartHeight - this.minResizeHeight);
        }
        break;
      case 'n':
        newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight - scaledDeltaY);
        topOffset = this.dragStartObjY + scaledDeltaY;
        // Adjust offset if minimum height reached
        if (newHeight === this.minResizeHeight) {
          topOffset = this.dragStartObjY + (this.resizeStartHeight - this.minResizeHeight);
        }
        break;
      case 's':
        newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight + scaledDeltaY);
        break;
      case 'e':
        newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth + scaledDeltaX);
        break;
      case 'w':
        newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth - scaledDeltaX);
        leftOffset = this.dragStartObjX + scaledDeltaX;
        // Adjust offset if minimum width reached
        if (newWidth === this.minResizeWidth) {
          leftOffset = this.dragStartObjX + (this.resizeStartWidth - this.minResizeWidth);
        }
        break;
    }
    
    // Update element position and dimensions
    element.style.position = 'relative';
    element.style.left = `${leftOffset}px`;
    element.style.top = `${topOffset}px`;
    
    img.style.width = `${newWidth}px`;
    img.style.height = `${newHeight}px`;
    
    // Update object properties
    this.selectedObject!.width = newWidth;
    this.selectedObject!.height = newHeight;
    this.selectedObject!.x = leftOffset;
    this.selectedObject!.y = topOffset;
  }
  
  resizeLine(element: HTMLElement, scaledDeltaX: number, scaledDeltaY: number, leftOffset: number, topOffset: number, newWidth: number, newHeight: number): void {
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
          newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth + scaledDeltaX);
          break;
        case 'w':
        case 'nw':
        case 'sw':
          newWidth = Math.max(this.minResizeWidth, this.resizeStartWidth - scaledDeltaX);
          leftOffset = this.dragStartObjX + scaledDeltaX;
          // Adjust offset if minimum width reached
          if (newWidth === this.minResizeWidth) {
            leftOffset = this.dragStartObjX + (this.resizeStartWidth - this.minResizeWidth);
          }
          break;
      }
      
      // Update element position and dimensions
      element.style.position = 'relative';
      element.style.left = `${leftOffset}px`;
      
      line.style.width = `${newWidth}px`;
      line.style.height = `${(this.selectedObject as LineObject).thickness}px`;
      
    } else {
      // For vertical line, only resize height
      switch(this.resizeHandle) {
        case 'n':
        case 'ne':
        case 'nw':
          newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight - scaledDeltaY);
          topOffset = this.dragStartObjY + scaledDeltaY;
          // Adjust offset if minimum height reached
          if (newHeight === this.minResizeHeight) {
            topOffset = this.dragStartObjY + (this.resizeStartHeight - this.minResizeHeight);
          }
          break;
        case 's':
        case 'se':
        case 'sw':
          newHeight = Math.max(this.minResizeHeight, this.resizeStartHeight + scaledDeltaY);
          break;
      }
      
      // Update element position and dimensions
      element.style.position = 'relative';
      element.style.top = `${topOffset}px`;
      
      line.style.height = `${newHeight}px`;
      line.style.width = `${(this.selectedObject as LineObject).thickness}px`;
    }
    
    // Update object properties
    this.selectedObject!.width = newWidth;
    this.selectedObject!.height = newHeight;
    this.selectedObject!.x = leftOffset;
    this.selectedObject!.y = topOffset;
  }
  
  resizeTable(element: HTMLElement, scaledDeltaX: number, scaledDeltaY: number, leftOffset: number, topOffset: number, newWidth: number, newHeight: number): void {
    // Handle each resize direction
    switch(this.resizeHandle) {
      case 'se':
        newWidth = Math.max(100, this.resizeStartWidth + scaledDeltaX);
        newHeight = Math.max(50, this.resizeStartHeight + scaledDeltaY);
        break;
      case 'sw':
        newWidth = Math.max(100, this.resizeStartWidth - scaledDeltaX);
        newHeight = Math.max(50, this.resizeStartHeight + scaledDeltaY);
        leftOffset = this.dragStartObjX + scaledDeltaX;
        if (newWidth === 100) {
          leftOffset = this.dragStartObjX + (this.resizeStartWidth - 100);
        }
        break;
      case 'ne':
        newWidth = Math.max(100, this.resizeStartWidth + scaledDeltaX);
        newHeight = Math.max(50, this.resizeStartHeight - scaledDeltaY);
        topOffset = this.dragStartObjY + scaledDeltaY;
        if (newHeight === 50) {
          topOffset = this.dragStartObjY + (this.resizeStartHeight - 50);
        }
        break;
      case 'nw':
        newWidth = Math.max(100, this.resizeStartWidth - scaledDeltaX);
        newHeight = Math.max(50, this.resizeStartHeight - scaledDeltaY);
        leftOffset = this.dragStartObjX + scaledDeltaX;
        topOffset = this.dragStartObjY + scaledDeltaY;
        if (newWidth === 100) {
          leftOffset = this.dragStartObjX + (this.resizeStartWidth - 100);
        }
        if (newHeight === 50) {
          topOffset = this.dragStartObjY + (this.resizeStartHeight - 50);
        }
        break;
      case 'n':
        newHeight = Math.max(50, this.resizeStartHeight - scaledDeltaY);
        topOffset = this.dragStartObjY + scaledDeltaY;
        if (newHeight === 50) {
          topOffset = this.dragStartObjY + (this.resizeStartHeight - 50);
        }
        break;
      case 's':
        newHeight = Math.max(50, this.resizeStartHeight + scaledDeltaY);
        break;
      case 'e':
        newWidth = Math.max(100, this.resizeStartWidth + scaledDeltaX);
        break;
      case 'w':
        newWidth = Math.max(100, this.resizeStartWidth - scaledDeltaX);
        leftOffset = this.dragStartObjX + scaledDeltaX;
        if (newWidth === 100) {
          leftOffset = this.dragStartObjX + (this.resizeStartWidth - 100);
        }
        break;
    }
    
    // Update element position and dimensions
    element.style.position = 'relative';
    element.style.left = `${leftOffset}px`;
    element.style.top = `${topOffset}px`;
    element.style.width = `${newWidth}px`;
    
    // Update object properties
    this.selectedObject!.width = newWidth;
    this.selectedObject!.height = newHeight;
    this.selectedObject!.x = leftOffset;
    this.selectedObject!.y = topOffset;
  }
  
  handleRotateMove(e: MouseEvent): void {
    // Calculate center of object
    const rect = this.selectedObject!.element!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate current angle
    const angleRadians = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const currentAngle = (angleRadians * 180 / Math.PI);
    
    // Calculate rotation change
    const angleDelta = currentAngle - this.rotateStartAngle;
    let newRotation = ((this.rotateStartX + angleDelta) % 360 + 360) % 360;
    
    // Apply rotation to element
    this.selectedObject!.element!.style.transform = `rotate(${newRotation}deg)`;
    
    // Update object rotation
    this.selectedObject!.rotation = newRotation;
    
    // Update resize handlers position and rotation
    this.updateResizeHandlersPosition();
  }
  
  handleMouseUp = (e: MouseEvent): void => {
    // Handle table cell resizing
    if (this.isTableCellResizing) {
      this.endTableCellResize();
      return;
    }
    
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
  
  // ===== TEXT FORMATTING =====
  
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

  applyTextFormatting(command: string, value: string = ''): void {
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    this.saveToHistory();
    document.execCommand(command, false, value);
    this.updateFormatButtons();
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
    
    // First ensure we have a selection
    if (!this.isSelectionInEditor()) {
      this.canvasContent.nativeElement.focus();
    }
    
    // Save to history
    this.saveToHistory();
    
    // Get the selection
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // Create a span with the specific font size
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = `${this.currentFontSize}px`;
    
    // Clone the range contents into the span
    span.appendChild(range.extractContents());
    
    // Insert the span
    range.insertNode(span);
    
    // Position cursor at the end
    range.selectNodeContents(span);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Update format buttons
    this.updateFormatButtons();
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

  // ===== TABLE INSERTION =====
  
  insertTable(): void {
    this.saveToHistory();
    
    if (!this.canvasContent?.nativeElement) return;
    
    // Focus the editor first
    this.canvasContent.nativeElement.focus();
    
    // Create table element
    const table = document.createElement('table');
    table.className = 'editor-table draggable';
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.border = `${this.tableBorderWidth}px ${this.tableBorderStyle} #000`;
    
    // Create table structure
    const tbody = document.createElement('tbody');
    
    for (let i = 0; i < this.tableRows; i++) {
      const row = document.createElement('tr');
      
      for (let j = 0; j < this.tableColumns; j++) {
        const cell = document.createElement('td');
        cell.className = 'table-cell';
        cell.style.border = `${this.tableBorderWidth}px ${this.tableBorderStyle} #000`;
        cell.style.padding = '8px';
        cell.style.minWidth = '50px';
        cell.style.position = 'relative';
        
        // Add empty content to ensure cell is editable
        cell.innerHTML = '<br>';
        
        // Add click handler for cell selection
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectTableCell(cell);
        });
        
        row.appendChild(cell);
      }
      
      tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
    
    // Create container for the table
    const tableContainer = document.createElement('div');
    tableContainer.className = 'editor-table-container';
    tableContainer.appendChild(table);
    
    // Add handler to make the table draggable
    table.addEventListener('mousedown', (e) => {
      if (e.target === table || (e.target as HTMLElement).tagName === 'TABLE') {
        e.preventDefault();
        e.stopPropagation();
        this.selectObject(table, 'table');
        this.startDrag(e, table);
      }
    });
    
    // Create paragraph for table (for proper spacing)
    const tableParagraph = document.createElement('p');
    tableParagraph.appendChild(tableContainer);
    
    // Insert at cursor position or at end
    this.insertContentAtCursor(tableParagraph);
    
    // Register the new table
    this.registerTableObject(table);
    
    // Close modal
    this.showTableModal = false;
    
    // Notify success
    this.notify(`Table with ${this.tableRows} rows and ${this.tableColumns} columns added`, 'success');
    
    // Save current page content
    this.saveCurrentPageContent();
  }

  // ===== LINE & IMAGE CREATION =====

  addHorizontalLine(): void {
    this.createLine('horizontal');
  }
  
  addVerticalLine(): void {
    this.createLine('vertical');
  }
  
  createLine(orientation: 'horizontal' | 'vertical'): void {
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
    
    // Insert at cursor position or at end
    this.insertContentAtCursor(lineParagraph);
    
    // Register the new line
    this.registerLineObject(lineContainer);
    this.selectObject(lineContainer, 'line', orientation);
    
    // Setup handlers for the new container
    this.setupObjectHandlers();
    
    // Notify success
    this.notify(`${orientation} line added successfully`, 'success');
    
    // Save current page content
    this.saveCurrentPageContent();
  }
  
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
    
    this.saveToHistory();
    
    // Store current selection/cursor position
    let selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      this.range = selection.getRangeAt(0).cloneRange();
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!this.canvasContent?.nativeElement) return;
      
      // Focus the editor
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
        imgContainer.style.position = 'relative';
        imgContainer.style.display = 'inline-block';
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
            evt.preventDefault();
            this.startDrag(evt, imgContainer);
          }
        });
        
        // Create paragraph for image
        const imgParagraph = document.createElement('p');
        imgParagraph.className = 'image-paragraph';
        imgParagraph.appendChild(imgContainer);
        
        // Insert at cursor position or at end
        this.insertContentAtCursor(imgParagraph, this.range);
        
        // Register the new image
        this.registerImageObject(imgContainer);
        this.selectObject(imgContainer, 'image');
        
        // Close modal
        this.showImageModal = false;
        
        this.notify('Image added successfully', 'success');
        this.saveCurrentPageContent();
      };
    };
    
    reader.readAsDataURL(file);
  }

  insertContentAtCursor(content: HTMLElement, customRange?: Range | null): void {
    // Use the stored range if available, otherwise use current selection
    let insertRange = customRange;
    if (!insertRange) {
      const currentSelection = window.getSelection();
      if (currentSelection && currentSelection.rangeCount > 0) {
        insertRange = currentSelection.getRangeAt(0);
      }
    }
    
    if (insertRange) {
      // Insert at cursor position
      insertRange.deleteContents();
      insertRange.insertNode(content);
      
      // Create a new paragraph after the content
      const afterParagraph = document.createElement('p');
      afterParagraph.innerHTML = '<br>';
      
      // Insert the paragraph after the content
      content.parentNode?.insertBefore(afterParagraph, content.nextSibling);
      
      // Move cursor to the new paragraph
      const newRange = document.createRange();
      newRange.setStart(afterParagraph, 0);
      newRange.collapse(true);
      
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else if (this.canvasContent && this.canvasContent.nativeElement) {
      // If no range available, append to the end
      this.canvasContent.nativeElement.appendChild(content);
      
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
  }

  // ===== FIELD INSERTION AND HANDLING =====
  
  handleCanvasInput(event: Event): void {
    this.closeFieldDropdown();
    this.saveCurrentPageContent();
  }

  checkForFieldTrigger(event: KeyboardEvent): void {
    // Only process if we're in the editor
    if (!this.canvasContent || !this.canvasContent.nativeElement) return;
    
    // Get current selection
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // Only look at editor content
    if (!this.isSelectionInEditor()) return;
    
    // Store cursor position for field insertion
    this.lastCursorPosition = selection.getRangeAt(0).cloneRange();
    
    // Get text content before cursor
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.canvasContent.nativeElement);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const textBeforeCursor = preCaretRange.toString();
    
    // Check if the last two characters are '{{'
    if (textBeforeCursor.endsWith('{{')) {
      // Calculate position for dropdown
      const rect = range.getBoundingClientRect();
      
      // Position dropdown near the cursor
      this.fieldDropdownPosition = { 
        top: `${rect.bottom}px`, 
        left: `${rect.left}px` 
      };
      
      // Show dropdown
      this.showFieldDropdown = true;
      
      // Focus the dropdown after it's rendered
      setTimeout(() => {
        if (this.fieldDropdownSelect) {
          this.fieldDropdownSelect.nativeElement.focus();
        }
      }, 10);
    }
  }
  
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
  
  insertFieldFromDropdown(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!select?.value) return;
    
    const fieldName = select.value;
    
    this.saveToHistory();
    
    // Use the last stored cursor position
    if (this.lastCursorPosition && this.canvasContent && this.canvasContent.nativeElement) {
      // Focus the editor
      this.canvasContent.nativeElement.focus();
      
      // Set selection to last cursor position
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(this.lastCursorPosition);
        
        // Delete the '{{' that triggered the dropdown
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.setStart(range.startContainer, Math.max(0, range.startOffset - 2));
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        preCaretRange.deleteContents();
        
        // Create the field span element
        const fieldSpan = document.createElement('span');
        fieldSpan.classList.add('field-placeholder');
        fieldSpan.setAttribute('data-field', fieldName);
        fieldSpan.contentEditable = 'false';
        fieldSpan.innerText = `{{${fieldName}}}`;
        
        // Insert the field
        range.insertNode(fieldSpan);
        
        // Move cursor after the field
        range.setStartAfter(fieldSpan);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    
    // Close dropdown
    this.closeFieldDropdown();
    
    this.notify(`Field ${fieldName} inserted`, 'success');
    this.saveCurrentPageContent();
  }
  
  closeFieldDropdown(): void {
    this.showFieldDropdown = false;
  }
  
  // ===== HISTORY & UTILITY =====
  
  saveToHistory(): void {
    if (!this.canvasContent) return;
    
    const currentState = this.canvasContent.nativeElement.innerHTML;
    this.undoStack.push(currentState);
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

  generateId(): string {
    return `obj-${this.nextId++}`;
  }
  
  adjustZoom(amount: number): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(10, Math.min(200, this.zoom + amount));
    
    // If zoom changed and something is selected, update handlers
    if (oldZoom !== this.zoom && this.selectedObject) {
      setTimeout(() => this.updateResizeHandlersPosition(), 0);
    }
  }
  
  // ===== NOTIFICATION =====
  
  notify(message: string, type: 'success' | 'warning' | 'error'): void {
    this.notification = message;
    this.notificationType = type;
    this.showNotification = true;
    
    setTimeout(() => {
      this.showNotification = false;
    }, 3000);
  }

  // ===== PRINTING =====
  
  printCanvas(): void {
    // First save current content
    this.saveCurrentPageContent();
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.notify('Please allow popups to print', 'warning');
      return;
    }
    
    // Create document content with styles
    const styles = `
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: ${this.currentFontFamily}, sans-serif;
        }
        
        .print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          margin: 10mm auto;
          background: white;
          box-shadow: 0 0 5mm rgba(0,0,0,0.1);
          position: relative;
          box-sizing: border-box;
        }
        
        .img-container, .line-container, .editor-table {
          page-break-inside: avoid;
        }
        
        .print-page img {
          max-width: 100%;
        }
        
        @media print {
          body {
            background: none;
          }
          
          .print-page {
            margin: 0;
            box-shadow: none;
            padding: ${this.documentForm.get('marginTop')?.value || 1.27}cm 
                      ${this.documentForm.get('marginRight')?.value || 1.27}cm 
                      ${this.documentForm.get('marginBottom')?.value || 1.27}cm 
                      ${this.documentForm.get('marginLeft')?.value || 1.27}cm;
          }
          
          .print-page + .print-page {
            page-break-before: always;
          }
        }
      </style>
    `;
    
    // Generate all pages content
    let pagesContent = '';
    this.pages.forEach(page => {
      // Fix relative positions and paths for printing
      const fixedContent = this.prepareContentForPrinting(page.content);
      
      // Add border to page if enabled
      let pageStyle = '';
      if (page.hasBorder) {
        pageStyle = `style="border: ${page.borderWidth || 1}px ${page.borderStyle || 'solid'} ${page.borderColor || '#000000'};"`;
      }
      
      pagesContent += `<div class="print-page" ${pageStyle}>${fixedContent}</div>`;
    });
    
    // Write to the print window
    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Document</title>
        ${styles}
        <!-- Import fonts -->
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Montserrat:wght@400;500;700&display=swap">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;700&family=Catamaran:wght@400;500;700&display=swap">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;700&family=Baloo+Tammudu+2:wght@400;500;700&display=swap">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;500;700&family=Manjari:wght@400;700&display=swap">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700&family=Poppins:wght@400;500;700&family=Hind:wght@400;500;700&display=swap">
      </head>
      <body>
        ${pagesContent}
        <script>
          window.onload = function() {
            window.setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  prepareContentForPrinting(content: string): string {
    // Create a temporary DOM element to fix content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Fix images, lines, and tables for printing
    this.fixObjectsForPrinting(tempDiv, 'img-container');
    this.fixObjectsForPrinting(tempDiv, 'line-container');
    this.fixObjectsForPrinting(tempDiv, 'editor-table');
    
    // Remove any resize or selection controls
    const controls = tempDiv.querySelectorAll('.resize-controls, .table-cell-resize-controls');
    controls.forEach(control => control.remove());
    
    // Remove selected class from any elements
    const selectedElements = tempDiv.querySelectorAll('.selected');
    selectedElements.forEach(el => el.classList.remove('selected'));
    
    return tempDiv.innerHTML;
  }

  // ===== KEYBOARD SHORTCUTS =====
  
  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    // Common keyboard shortcuts
    if (e.ctrlKey) {
      switch (e.key) {
        case 'z':
          e.preventDefault();
          this.undo();
          break;
        case 'y':
          e.preventDefault();
          this.redo();
          break;
        case 'b':
          e.preventDefault();
          this.toggleBold();
          break;
        case 'i':
          e.preventDefault();
          this.toggleItalic();
          break;
        case 'u':
          e.preventDefault();
          this.toggleUnderline();
          break;
        case 'p':
          e.preventDefault();
          this.printCanvas();
          break;
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.indent();
    } else if (e.key === 'Delete') {
      this.handleDeleteKey(e);
    }
  }

  handleDeleteKey(e: KeyboardEvent): void {
    if (this.selectedObject && this.selectedObject.element) {
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
    } else if (this.selectedTableCell) {
      e.preventDefault();
      // Clear the content of the selected cell
      this.selectedTableCell.innerHTML = '<br>';
      
      // Save state
      this.saveToHistory();
      this.saveCurrentPageContent();
    }
  }

  // ===== FORM SUBMISSION =====
  
  onSubmit(): void {
    if (this.documentForm.valid) {
      this.saveCurrentPageContent();
      
      // Get all pages content with borders
      const allPagesContent = this.getAllPagesContent();
      this.documentForm.patchValue({ content: allPagesContent });

      // Create form data for API submission
      let finalData = {
        ...this.documentForm.value, 
        isactive: true,
      };
      
      // Submit to API
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

  fixObjectsForPrinting(container: HTMLElement, selector: string): void {
  const elements = container.querySelectorAll(`.${selector}`);
  
  elements.forEach(element => {
    const computedStyle = window.getComputedStyle(element as HTMLElement);
    
    // Handle position
    if (computedStyle.position === 'relative') {
      const left = parseInt(computedStyle.left || '0', 10);
      const top = parseInt(computedStyle.top || '0', 10);
      
      if (left !== 0 || top !== 0) {
        (element as HTMLElement).style.position = 'absolute';
        (element as HTMLElement).style.left = `${left}px`;
        (element as HTMLElement).style.top = `${top}px`;
      }
    }
    
    // Handle rotation
    const transform = computedStyle.transform;
    if (transform && transform !== 'none') {
      (element as HTMLElement).style.transform = transform;
    }
  });
}
  
  getAllPagesContent(): string {
    return this.pages.map(page => {
      // Add border styles if present
      let pageStyle = '';
      if (page.hasBorder) {
        pageStyle = ` style="border: ${page.borderWidth || 1}px ${page.borderStyle || 'solid'} ${page.borderColor || '#000000'};"`;
      }
      return `<div class="editor-page"${pageStyle}>${page.content}</div>`;
    }).join('');
  }
}