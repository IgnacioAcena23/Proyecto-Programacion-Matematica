/**
 * NexusCore Systems - Optimización de Logística y Talento
 * app.js - Gestión de la interfaz, eventos, formularios dinámicos y Groq API.
 */

// Helper to format numbers as currency
function formatCurrency(val) {
    return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(val);
}

// Simple Markdown parser for Groq AI responses
function parseMarkdown(md) {
    let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Headings
    html = html.replace(/^###\s+(.*?)$/gm, '<h4>$1</h4>');
    html = html.replace(/^##\s+(.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#\s+(.*?)$/gm, '<h2>$1</h2>');
    
    // Lists
    let inList = false;
    const lines = html.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const itemContent = trimmed.substring(2);
            if (!inList) {
                lines[i] = '<ul><li>' + itemContent + '</li>';
                inList = true;
            } else {
                lines[i] = '<li>' + itemContent + '</li>';
            }
        } else {
            if (inList && trimmed !== "") {
                lines[i] = '</ul>' + lines[i];
                inList = false;
            }
        }
    }
    if (inList) {
        lines.push('</ul>');
    }
    html = lines.join('\n');
    
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    return html;
}


// =============================================================================
//  GESTIÓN DE FORMULARIO DE LOGÍSTICA DE TRANSPORTE
// =============================================================================

class TransportFormManager {
    constructor(app) {
        this.app = app;
        
        // Elementos DOM
        this.originsInput = document.getElementById('trans-origins');
        this.destsInput = document.getElementById('trans-destinations');
        this.btnGenerate = document.getElementById('btn-generate-transport');
        this.btnClear = document.getElementById('btn-clear-transport');
        this.btnSolve = document.getElementById('btn-solve-transport');
        
        this.matrixContainer = document.getElementById('transport-matrix-container');
        this.resultsPanel = document.getElementById('transport-results-panel');
        this.resStepsList = document.getElementById('res-steps-list');
        this.resMatrixContainer = document.getElementById('transport-result-matrix');
        
        this.valTotalSupply = document.getElementById('val-total-supply');
        this.valTotalDemand = document.getElementById('val-total-demand');
        this.balanceBadge = document.getElementById('balance-badge');
        this.balanceAlertText = document.getElementById('balance-alert-text');
        
        this.solverOptions = document.querySelectorAll('#view-transport .solver-option');
        
        // Estado
        this.m = 3;
        this.n = 3;
        this.selectedMethod = 'noroeste';
        this.lastSolution = null;

        this.init();
    }

    init() {
        this.btnGenerate.addEventListener('click', () => {
            this.m = parseInt(this.originsInput.value) || 3;
            this.n = parseInt(this.destsInput.value) || 3;
            this.generateGrid();
        });

        this.btnClear.addEventListener('click', () => this.clearGrid());
        this.btnSolve.addEventListener('click', () => this.solve());

        const pdfBtn = document.getElementById('btn-export-pdf-transport');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', () => this.app.exportPDF('transport'));
        }

        // Manejar selección de método
        this.solverOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                this.solverOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.selectedMethod = opt.dataset.method;
            });
        });

        // Generar grid inicial
        this.generateGrid();
    }

    generateGrid(preloadData = null) {
        let html = `<table class="matrix-table" id="trans-input-table">`;
        
        // Fila de encabezado
        html += `<thead><tr><th></th>`;
        for (let j = 0; j < this.n; j++) {
            const destVal = preloadData ? (preloadData.destNames[j] || `Destino ${j+1}`) : `Destino ${j+1}`;
            html += `<th class="header-node"><input type="text" class="node-name-input" value="${destVal}" data-type="dest" data-idx="${j}"></th>`;
        }
        html += `<th class="header-node">Oferta</th></tr></thead><tbody>`;

        // Filas de costos y oferta
        for (let i = 0; i < this.m; i++) {
            const originVal = preloadData ? (preloadData.originNames[i] || `Origen ${i+1}`) : `Origen ${i+1}`;
            html += `<tr><td class="header-node"><input type="text" class="node-name-input" value="${originVal}" data-type="origin" data-idx="${i}"></td>`;
            for (let j = 0; j < this.n; j++) {
                const costVal = preloadData ? preloadData.costs[i][j] : 0;
                html += `<td><input type="number" class="cell-input cost-cell" value="${costVal}" min="0" data-row="${i}" data-col="${j}"></td>`;
            }
            const supplyVal = preloadData ? preloadData.supply[i] : 0;
            html += `<td class="cell-supply"><input type="number" class="cell-input cell-supply-input" value="${supplyVal}" min="0" data-row="${i}"></td></tr>`;
        }

        // Fila de demanda
        html += `<tr><td class="header-node">Demanda</td>`;
        for (let j = 0; j < this.n; j++) {
            const demandVal = preloadData ? preloadData.demand[j] : 0;
            html += `<td class="cell-demand"><input type="number" class="cell-input cell-demand-input" value="${demandVal}" min="0" data-col="${j}"></td>`;
        }
        html += `<td class="dummy">—</td></tr></tbody></table>`;

        this.matrixContainer.innerHTML = html;
        this.resultsPanel.style.display = 'none';

        // Escuchar cambios para calcular balance en tiempo real
        this.setupRealTimeBalance();
        this.updateBalance();
    }

    setupRealTimeBalance() {
        const inputs = this.matrixContainer.querySelectorAll('.cell-supply-input, .cell-demand-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.updateBalance());
        });
    }

    updateBalance() {
        let totalSupply = 0;
        let totalDemand = 0;

        this.matrixContainer.querySelectorAll('.cell-supply-input').forEach(el => {
            totalSupply += parseFloat(el.value) || 0;
        });

        this.matrixContainer.querySelectorAll('.cell-demand-input').forEach(el => {
            totalDemand += parseFloat(el.value) || 0;
        });

        this.valTotalSupply.textContent = totalSupply;
        this.valTotalDemand.textContent = totalDemand;

        if (totalSupply === totalDemand) {
            this.balanceBadge.textContent = "Balanceado";
            this.balanceBadge.className = "balance-badge badge-success";
            this.balanceAlertText.innerHTML = "El problema está equilibrado. No se requieren ajustes.";
        } else {
            this.balanceBadge.textContent = "Desbalanceado";
            this.balanceBadge.className = "balance-badge badge-warning";
            const diff = Math.abs(totalSupply - totalDemand);
            if (totalSupply > totalDemand) {
                this.balanceAlertText.innerHTML = `La oferta supera a la demanda por <strong>${diff}</strong>. El solver añadirá automáticamente un <strong>Destino Ficticio</strong> con costo cero.`;
            } else {
                this.balanceAlertText.innerHTML = `La demanda supera a la oferta por <strong>${diff}</strong>. El solver añadirá automáticamente un <strong>Origen Ficticio</strong> con costo cero.`;
            }
        }
    }

    clearGrid() {
        this.matrixContainer.querySelectorAll('.cell-input').forEach(el => el.value = 0);
        this.updateBalance();
        this.resultsPanel.style.display = 'none';
    }

    readData() {
        const costInputs = this.matrixContainer.querySelectorAll('.cost-cell');
        const supplyInputs = this.matrixContainer.querySelectorAll('.cell-supply-input');
        const demandInputs = this.matrixContainer.querySelectorAll('.cell-demand-input');
        const nameInputs = this.matrixContainer.querySelectorAll('.node-name-input');

        const costs = Array.from({length: this.m}, () => new Array(this.n).fill(0));
        costInputs.forEach(el => {
            const r = parseInt(el.dataset.row);
            const c = parseInt(el.dataset.col);
            costs[r][c] = parseFloat(el.value) || 0;
        });

        const supply = Array.from({length: this.m}, (_, i) => parseFloat(supplyInputs[i].value) || 0);
        const demand = Array.from({length: this.n}, (_, j) => parseFloat(demandInputs[j].value) || 0);

        const originNames = [];
        const destNames = [];
        nameInputs.forEach(el => {
            if (el.dataset.type === 'origin') {
                originNames[parseInt(el.dataset.idx)] = el.value.trim() || `Origen ${parseInt(el.dataset.idx) + 1}`;
            } else {
                destNames[parseInt(el.dataset.idx)] = el.value.trim() || `Destino ${parseInt(el.dataset.idx) + 1}`;
            }
        });

        return { costs, supply, demand, originNames, destNames };
    }

    solve() {
        const data = this.readData();
        const problem = new TransportProblem(data.costs, data.supply, data.demand, data.originNames, data.destNames);
        
        let result;
        if (this.selectedMethod === 'noroeste') {
            result = NorthwestCornerSolver.solve(problem);
        } else if (this.selectedMethod === 'costo_minimo') {
            result = LeastCostSolver.solve(problem);
        } else {
            result = VogelSolver.solve(problem);
        }

        this.lastSolution = {
            methodName: this.selectedMethod === 'noroeste' ? 'Esquina Noroeste' : this.selectedMethod === 'costo_minimo' ? 'Costo Mínimo' : 'Aproximación de Vogel',
            problemData: data,
            solutionData: result
        };

        this.renderResults(result);

        // Optimizar y Analizar: dispara inmediatamente el análisis con IA
        this.app.runAIAnalysis();
    }

    renderResults(res) {
        this.resultsPanel.style.display = 'block';
        document.getElementById('res-total-cost').textContent = formatCurrency(res.totalCost);
        
        // Contar celdas asignadas
        let assignedCount = 0;
        res.assignments.forEach(row => {
            row.forEach(val => { if (val > 0) assignedCount++; });
        });
        document.getElementById('res-cells-count').textContent = assignedCount;

        // Renderizar pasos
        let stepsHtml = "";
        res.steps.forEach(step => {
            stepsHtml += `
                <li>
                    <span class="step-num">Paso ${step.num}</span>
                    <span class="step-content">${step.text} ➔ Cantidad: <strong>${step.qty}</strong> (costo unitario: ${formatCurrency(step.cost)})</span>
                    <span class="step-subtext">${step.detail} | Subtotal: ${formatCurrency(step.subtotal)}</span>
                </li>
            `;
        });
        this.resStepsList.innerHTML = stepsHtml;

        // Renderizar matriz de resultados resaltada
        const rows = res.balancedCosts.length;
        const cols = res.balancedCosts[0].length;
        
        let matrixHtml = `<table class="matrix-table"><thead><tr><th></th>`;
        for (let j = 0; j < cols; j++) {
            const isDummy = res.dummyColAdded && (j === cols - 1);
            matrixHtml += `<th class="${isDummy ? 'dummy' : ''}">${res.destNames[j]}</th>`;
        }
        matrixHtml += `<th>Oferta</th></tr></thead><tbody>`;

        for (let i = 0; i < rows; i++) {
            const isDummyRow = res.dummyRowAdded && (i === rows - 1);
            matrixHtml += `<tr class="${isDummyRow ? 'dummy' : ''}"><strong>`;
            matrixHtml += `<td class="header-node">${res.originNames[i]}</td>`;
            for (let j = 0; j < cols; j++) {
                const qty = res.assignments[i][j];
                const cost = res.balancedCosts[i][j];
                const isDummyCol = res.dummyColAdded && (j === cols - 1);
                
                if (qty > 0) {
                    matrixHtml += `
                        <td class="assigned-cell ${isDummyRow || isDummyCol ? 'dummy' : ''}">
                            <div style="font-weight:700;">${cost}</div>
                            <span class="assigned-qty-badge">${qty}</span>
                        </td>
                    `;
                } else {
                    matrixHtml += `<td class="${isDummyRow || isDummyCol ? 'dummy' : ''}">${cost}</td>`;
                }
            }
            
            // Mostrar capacidad inicial
            const initialSupply = i < this.m ? this.lastSolution.problemData.supply[i] : res.steps.find(s => s.text.includes(res.originNames[i]))?.qty || 0;
            matrixHtml += `<td class="cell-supply">${initialSupply}</td></tr>`;
        }

        // Fila de demanda inicial
        matrixHtml += `<tr><td class="header-node">Demanda</td>`;
        for (let j = 0; j < cols; j++) {
            const isDummyCol = res.dummyColAdded && (j === cols - 1);
            const initialDemand = j < this.n ? this.lastSolution.problemData.demand[j] : res.steps.find(s => s.text.includes(res.destNames[j]))?.qty || 0;
            matrixHtml += `<td class="cell-demand ${isDummyCol ? 'dummy' : ''}">${initialDemand}</td>`;
        }
        matrixHtml += `<td>—</td></tr></tbody></table>`;

        this.resMatrixContainer.innerHTML = matrixHtml;
        
        // Scroll suave hasta los resultados
        this.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }
}


// =============================================================================
//  GESTIÓN DE FORMULARIO DE ASIGNACIÓN DE TALENTO
// =============================================================================

class AssignmentFormManager {
    constructor(app) {
        this.app = app;
        
        // Elementos DOM
        this.sizeInput = document.getElementById('assign-size');
        this.btnGenerate = document.getElementById('btn-generate-assignment');
        this.btnClear = document.getElementById('btn-clear-assignment');
        this.btnSolve = document.getElementById('btn-solve-assignment');
        this.matrixContainer = document.getElementById('assignment-matrix-container');
        this.resultsPanel = document.getElementById('assignment-results-panel');
        this.resValue = document.getElementById('res-assign-total-value');
        this.resLabel = document.getElementById('assign-result-label');
        this.resList = document.getElementById('res-assign-list');
        this.resMatrixContainer = document.getElementById('assignment-result-matrix');
        
        this.optMinBtn = document.getElementById('btn-opt-min');
        this.optMaxBtn = document.getElementById('btn-opt-max');

        // Estado
        this.N = 3;
        this.criterion = 'minimize'; // minimize / maximize
        this.lastSolution = null;

        this.init();
    }

    init() {
        this.btnGenerate.addEventListener('click', () => {
            this.N = parseInt(this.sizeInput.value) || 3;
            this.generateGrid();
        });

        this.btnClear.addEventListener('click', () => this.clearGrid());
        this.btnSolve.addEventListener('click', () => this.solve());

        const pdfBtn = document.getElementById('btn-export-pdf-assignment');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', () => this.app.exportPDF('assignment'));
        }

        const handleOptChange = (crit) => {
            this.criterion = crit;
            if (crit === 'minimize') {
                this.optMinBtn.classList.add('active');
                this.optMaxBtn.classList.remove('active');
            } else {
                this.optMaxBtn.classList.add('active');
                this.optMinBtn.classList.remove('active');
            }
        };

        this.optMinBtn.addEventListener('click', () => handleOptChange('minimize'));
        this.optMaxBtn.addEventListener('click', () => handleOptChange('maximize'));

        this.generateGrid();
    }

    generateGrid(preloadData = null) {
        let html = `<table class="matrix-table">`;
        
        // Header
        html += `<thead><tr><th></th>`;
        for (let j = 0; j < this.N; j++) {
            const taskName = preloadData ? (preloadData.taskNames[j] || `Tarea ${j+1}`) : `Tarea ${j+1}`;
            html += `<th class="header-node"><input type="text" class="node-name-input" value="${taskName}" data-type="task" data-idx="${j}"></th>`;
        }
        html += `</tr></thead><tbody>`;

        // Rows
        for (let i = 0; i < this.N; i++) {
            const personName = preloadData ? (preloadData.personNames[i] || `Talento ${i+1}`) : `Talento ${i+1}`;
            html += `<tr><td class="header-node"><input type="text" class="node-name-input" value="${personName}" data-type="person" data-idx="${i}"></td>`;
            for (let j = 0; j < this.N; j++) {
                const val = preloadData ? preloadData.matrix[i][j] : 0;
                html += `<td><input type="number" class="cell-input value-cell" value="${val}" min="0" data-row="${i}" data-col="${j}"></td>`;
            }
            html += `</tr>`;
        }
        html += `</tbody></table>`;

        this.matrixContainer.innerHTML = html;
        this.resultsPanel.style.display = 'none';
    }

    clearGrid() {
        this.matrixContainer.querySelectorAll('.cell-input').forEach(el => el.value = 0);
        this.resultsPanel.style.display = 'none';
    }

    readData() {
        const valCells = this.matrixContainer.querySelectorAll('.value-cell');
        const nameInputs = this.matrixContainer.querySelectorAll('.node-name-input');
        
        const matrix = Array.from({length: this.N}, () => new Array(this.N).fill(0));
        valCells.forEach(el => {
            const r = parseInt(el.dataset.row);
            const c = parseInt(el.dataset.col);
            matrix[r][c] = parseFloat(el.value) || 0;
        });

        const personNames = [];
        const taskNames = [];
        nameInputs.forEach(el => {
            if (el.dataset.type === 'person') {
                personNames[parseInt(el.dataset.idx)] = el.value.trim() || `Talento ${parseInt(el.dataset.idx) + 1}`;
            } else {
                taskNames[parseInt(el.dataset.idx)] = el.value.trim() || `Tarea ${parseInt(el.dataset.idx) + 1}`;
            }
        });

        return { matrix, personNames, taskNames };
    }

    solve() {
        const data = this.readData();
        const isMax = this.criterion === 'maximize';
        const result = HungarianSolver.solve(data.matrix, isMax);

        this.lastSolution = {
            criterion: this.criterion,
            problemData: data,
            solutionData: result
        };

        this.renderResults(result, data);

        // Optimizar y Analizar: dispara inmediatamente el análisis con IA
        this.app.runAIAnalysis();
    }

    renderResults(res, problemData) {
        this.resultsPanel.style.display = 'block';
        this.resValue.textContent = res.totalValue;
        this.resLabel.textContent = this.criterion === 'minimize' ? 'Costo Mínimo Total' : 'Rendimiento Máximo Total';

        // Renderizar lista de asignaciones
        let htmlList = "";
        res.assignments.forEach(([r, c]) => {
            const namePerson = problemData.personNames[r];
            const nameTask = problemData.taskNames[c];
            const val = problemData.matrix[r][c];
            htmlList += `
                <li>
                    <span class="step-content"><strong>${namePerson}</strong> ➔ asignado a: <strong>${nameTask}</strong></span>
                    <span class="step-subtext">Valor de asignación: ${val}</span>
                </li>
            `;
        });
        this.resList.innerHTML = htmlList;

        // Renderizar matriz visual destacada
        let matrixHtml = `<table class="matrix-table"><thead><tr><th></th>`;
        for (let j = 0; j < this.N; j++) {
            matrixHtml += `<th>${problemData.taskNames[j]}</th>`;
        }
        matrixHtml += `</tr></thead><tbody>`;

        for (let i = 0; i < this.N; i++) {
            matrixHtml += `<tr><td class="header-node">${problemData.personNames[i]}</td>`;
            for (let j = 0; j < this.N; j++) {
                const val = problemData.matrix[i][j];
                const isAssigned = res.assignments.some(([ar, ac]) => ar === i && ac === j);
                if (isAssigned) {
                    matrixHtml += `
                        <td class="assigned-cell-indigo">
                            <div style="font-weight:700;">${val}</div>
                            <span class="assigned-qty-badge-indigo">✓</span>
                        </td>
                    `;
                } else {
                    matrixHtml += `<td>${val}</td>`;
                }
            }
            matrixHtml += `</tr>`;
        }
        matrixHtml += `</tbody></table>`;
        this.resMatrixContainer.innerHTML = matrixHtml;

        this.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }
}


// =============================================================================
//  CLASE CONTROLADORA PRINCIPAL DE LA APLICACIÓN
// =============================================================================

class NexusCoreApp {
    constructor() {
        this.currentView = 'transport'; // 'transport' o 'assignment'
        this.groqApiKey = "";

        // Form Managers
        this.transportManager = null;
        this.assignmentManager = null;

        this.init();
    }

    async init() {
        // Inicializar Managers
        this.transportManager = new TransportFormManager(this);
        this.assignmentManager = new AssignmentFormManager(this);

        // Configurar navegación
        this.setupNavigation();

        // Configurar Drawer e IA
        this.setupAIDrawer();

        // Intentar leer .env para Groq API Key
        await this.loadApiKeyFromEnv();
    }

    setupNavigation() {
        const btnTrans = document.getElementById('tab-btn-transport');
        const btnAssign = document.getElementById('tab-btn-assignment');
        const viewTrans = document.getElementById('view-transport');
        const viewAssign = document.getElementById('view-assignment');
        
        const viewTitle = document.getElementById('view-title');
        const viewDesc = document.getElementById('view-desc');
        const btnLoadTest = document.getElementById('btn-load-test');

        const switchTab = (tab) => {
            this.currentView = tab;
            if (tab === 'transport') {
                btnTrans.classList.add('active');
                btnAssign.classList.remove('active');
                viewTrans.classList.add('active');
                viewAssign.classList.remove('active');
                
                viewTitle.textContent = "Optimización Logística de Transporte";
                viewDesc.textContent = "Determina el plan de distribución óptimo mediante métodos clásicos de programación lineal con balanceo en tiempo real.";
            } else {
                btnAssign.classList.add('active');
                btnTrans.classList.remove('active');
                viewAssign.classList.add('active');
                viewTrans.classList.remove('active');
                
                viewTitle.textContent = "Optimización de Asignación de Talento";
                viewDesc.textContent = "Asigna inteligentemente personas a tareas mediante el algoritmo Húngaro exacto, maximizando capacidades o minimizando costos.";
            }
        };

        btnTrans.addEventListener('click', () => switchTab('transport'));
        btnAssign.addEventListener('click', () => switchTab('assignment'));

        btnLoadTest.addEventListener('click', () => this.loadTestCase());
    }

    setupAIDrawer() {
        const overlay = document.getElementById('ai-drawer-overlay');
        const drawer = document.getElementById('ai-drawer');
        const btnClose = document.getElementById('btn-close-drawer');
        const btnTrigger = document.getElementById('btn-trigger-ai-run');
        const btnAiAnalyze = document.getElementById('btn-ai-analyze');
        const btnAiAnalyzeAssign = document.getElementById('btn-ai-analyze-assign');
        
        const openDrawer = () => {
            overlay.classList.add('active');
            drawer.classList.add('active');
        };

        const closeDrawer = () => {
            overlay.classList.remove('active');
            drawer.classList.remove('active');
        };

        btnClose.addEventListener('click', closeDrawer);
        overlay.addEventListener('click', closeDrawer);

        btnAiAnalyze.addEventListener('click', openDrawer);
        btnAiAnalyzeAssign.addEventListener('click', openDrawer);

        btnTrigger.addEventListener('click', () => this.runAIAnalysis());
    }

    async loadApiKeyFromEnv() {
        const statusCard = document.getElementById('api-status-card');
        const userKeyInput = document.getElementById('user-api-key');

        // Intentar leer de localStorage primero
        const savedKey = localStorage.getItem('nexuscore_groq_api_key');
        if (savedKey) {
            this.groqApiKey = savedKey;
            userKeyInput.value = savedKey;
            statusCard.innerHTML = `<span class="status-dot online"></span><span class="status-text">Groq IA: Conectado (Manual)</span>`;
            return;
        }

        // Intentar leer de config.js (window.ENV) primero para evitar problemas con CORS en file://
        if (window.ENV && window.ENV.GROQ_API_KEY) {
            this.groqApiKey = window.ENV.GROQ_API_KEY;
            statusCard.innerHTML = `<span class="status-dot online"></span><span class="status-text">Groq IA: Listo (config)</span>`;
            userKeyInput.placeholder = "API Key cargada desde config.js";
            return;
        }

        try {
            // Intentar fetch a .env local (funcionará si está bajo servidor local)
            const resp = await fetch('.env');
            if (resp.ok) {
                const text = await resp.text();
                const match = text.match(/GROQ_API_KEY\s*=\s*(gsk_[a-zA-Z0-9_]+)/);
                if (match && match[1]) {
                    this.groqApiKey = match[1].trim();
                    statusCard.innerHTML = `<span class="status-dot online"></span><span class="status-text">Groq IA: Listo (.env)</span>`;
                    userKeyInput.placeholder = "API Key cargada desde .env";
                }
            }
        } catch (e) {
            // Falla silenciosa si no hay server HTTP (CORS) o archivo no encontrado
            console.log("No se pudo cargar la API Key del .env local (seguramente ejecutando vía archivo local file://).");
        }
    }

    loadTestCase() {
        if (this.currentView === 'transport') {
            // Caso de transporte de prueba (5 orígenes x 5 destinos) desbalanceado
            this.transportManager.originsInput.value = 5;
            this.transportManager.destsInput.value = 5;
            this.transportManager.m = 5;
            this.transportManager.n = 5;
            
            const testData = {
                originNames: ["Planta Norte", "Planta Sur", "Planta Este", "Planta Oeste", "Planta Centro"],
                destNames: ["Centro GDL", "Centro CDMX", "Centro MTY", "Centro PUE", "Centro QRO"],
                costs: [
                    [4, 6, 8, 5, 6],
                    [3, 7, 6, 3, 2],
                    [3, 5, 4, 2, 8],
                    [2, 8, 4, 6, 6],
                    [9, 7, 5, 4, 6]
                ],
                supply: [50, 60, 40, 30, 70],
                demand: [40, 60, 50, 60, 90]
            };
            this.transportManager.generateGrid(testData);
        } else {
            // Caso de asignación de prueba (4x4)
            this.assignmentManager.sizeInput.value = 4;
            this.assignmentManager.N = 4;
            
            const testData = {
                personNames: ["Ing. Carlos", "Dra. Sofía", "Msc. Daniel", "Tec. Lucía"],
                taskNames: ["Liderazgo I+D", "Desarrollo Cloud", "Análisis Datos", "Soporte DevOps"],
                matrix: [
                    [90, 85, 75, 60],
                    [85, 95, 80, 70],
                    [70, 80, 85, 90],
                    [65, 75, 80, 95]
                ]
            };
            this.assignmentManager.generateGrid(testData);
        }
    }

    async runAIAnalysis() {
        const outputContainer = document.getElementById('ai-output-container');
        const userKeyInput = document.getElementById('user-api-key');
        
        // Elementos en pantalla principal
        let onPageContainer = null;
        let onPageText = null;
        
        if (this.currentView === 'transport') {
            onPageContainer = document.getElementById('trans-coo-report');
            onPageText = document.getElementById('trans-coo-report-text');
        } else {
            onPageContainer = document.getElementById('assign-coo-report');
            onPageText = document.getElementById('assign-coo-report-text');
        }

        // Leer clave si el usuario la ingresó
        if (userKeyInput.value.trim() !== "") {
            this.groqApiKey = userKeyInput.value.trim();
            localStorage.setItem('nexuscore_groq_api_key', this.groqApiKey);
            document.getElementById('api-status-card').innerHTML = `<span class="status-dot online"></span><span class="status-text">Groq IA: Conectado</span>`;
        }

        if (!this.groqApiKey) {
            const errorHtml = `
                <div class="ai-welcome-msg" style="color: var(--danger); text-align: center;">
                    ❌ Error: No se encontró la clave API de Groq.<br>
                    Por favor, abre el panel lateral (Groq IA: Sin conectar) e ingresa tu clave API para habilitar el reporte cualitativo del COO.
                </div>
            `;
            outputContainer.innerHTML = errorHtml;
            if (onPageContainer && onPageText) {
                onPageContainer.style.display = 'block';
                onPageText.innerHTML = errorHtml;
            }
            return;
        }

        // Determinar qué problema estamos analizando
        let prompt = "";
        if (this.currentView === 'transport') {
            const sol = this.transportManager.lastSolution;
            if (!sol) {
                outputContainer.innerHTML = `<div class="ai-welcome-msg">Primero debes resolver el problema en pantalla.</div>`;
                return;
            }

            const dummyText = sol.solutionData.dummyRowAdded ? "Se agregó un origen ficticio por desbalanceo" : sol.solutionData.dummyColAdded ? "Se agregó un destino ficticio por desbalanceo" : "El problema de origen estaba balanceado";
            const assignmentsText = sol.solutionData.steps.map(s => ` - ${s.text}: ${s.qty} unidades a costo ${s.cost} (subtotal ${s.subtotal})`).join('\n');

            prompt = `
                Eres el Director de Operaciones (COO) de NexusCore Systems.
                Se ha optimizado la logística de distribución mediante el método de ${sol.methodName}.
                
                Debes interpretar el impacto operacional de esta configuración de datos específica.
                
                Datos ingresados por el usuario:
                - Orígenes: ${sol.problemData.originNames.join(', ')}
                - Destinos: ${sol.problemData.destNames.join(', ')}
                - Oferta disponible: ${sol.problemData.supply.join(', ')}
                - Demanda requerida: ${sol.problemData.demand.join(', ')}
                - Ajuste de balance: ${dummyText}
                
                Asignaciones calculadas:
                ${assignmentsText}
                
                Costo Total de la Operación: ${formatCurrency(sol.solutionData.totalCost)}
                
                Por favor, redacta un informe ejecutivo formal en español analizando:
                1. Cuellos de botella y limitaciones de capacidad en orígenes.
                2. Riesgos logísticos clave en las rutas de distribución seleccionadas.
                3. Balance de carga de trabajo general entre los nodos.
                4. Conclusión final de recomendación operativa.
                
                Escribe de forma directa y ejecutiva (máximo 250 palabras) utilizando Markdown.
            `;
        } else {
            const sol = this.assignmentManager.lastSolution;
            if (!sol) {
                outputContainer.innerHTML = `<div class="ai-welcome-msg">Primero debes resolver el problema en pantalla.</div>`;
                return;
            }

            const typeText = sol.criterion === 'minimize' ? 'Minimizar costos/horas' : 'Maximizar rendimiento/compatibilidad de talento';
            const assignmentsText = sol.solutionData.assignments.map(([r, c]) => {
                const person = sol.problemData.personNames[r];
                const task = sol.problemData.taskNames[c];
                const val = sol.problemData.matrix[r][c];
                return ` - ${person} ➔ ${task} (Valor/Costo: ${val})`;
            }).join('\n');

            prompt = `
                Eres el Director de Operaciones (COO) de NexusCore Systems.
                Se ha optimizado la asignación de talento para tareas críticas usando el Algoritmo Húngaro.
                
                Debes interpretar el impacto operacional de esta configuración de datos específica.
                
                Datos ingresados por el usuario:
                - Talentos disponibles: ${sol.problemData.personNames.join(', ')}
                - Tareas a cubrir: ${sol.problemData.taskNames.join(', ')}
                - Criterio de optimización: ${typeText}
                
                Emparejamientos óptimos calculados:
                ${assignmentsText}
                
                Valor de la función objetivo total: ${sol.solutionData.totalValue}
                
                Por favor, redacta un informe ejecutivo formal en español analizando:
                1. El impacto operacional de esta asignación de personal en los equipos de trabajo.
                2. Riesgos operativos de la configuración de talento elegida.
                3. Balance de cargas de trabajo y roles asignados a cada individuo.
                4. Conclusión final de recomendación operativa.
                
                Escribe de forma directa y ejecutiva (máximo 250 palabras) utilizando Markdown.
            `;
        }

        // Mostrar estado de carga
        const loadingHtml = `
            <div style="text-align:center; padding: 20px 0;">
                <div class="spinner"></div>
                <p style="color: var(--text-muted); margin-top:12px; font-size:12px;">El Director de Operaciones (COO) está analizando la configuración...</p>
            </div>
        `;
        outputContainer.innerHTML = loadingHtml;
        if (onPageContainer && onPageText) {
            onPageContainer.style.display = 'block';
            onPageText.innerHTML = loadingHtml;
        }

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.groqApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                const msg = errBody?.error?.message || response.statusText;
                throw new Error(`HTTP ${response.status} – ${msg}`);
            }

            const result = await response.json();
            const aiText = result.choices[0].message.content.trim();
            const parsedHtml = parseMarkdown(aiText);
            
            outputContainer.innerHTML = `<div class="ai-response-text">${parsedHtml}</div>`;
            if (onPageText) {
                onPageText.innerHTML = parsedHtml;
            }
        } catch (e) {
            const errorMsg = `
                <div class="ai-welcome-msg" style="color: var(--danger);">
                    ❌ Error al contactar a la IA:<br>
                    ${e.message}
                </div>
            `;
            outputContainer.innerHTML = errorMsg;
            if (onPageText) {
                onPageText.innerHTML = errorMsg;
            }
        }
    }

    exportPDF(type) {
        let sol = null;
        let title = "";
        let inputHtml = "";
        let iterationsHtml = "";
        let outputHtml = "";
        let aiHtml = "";
        let metricHtml = "";
        
        if (type === 'transport') {
            sol = this.transportManager.lastSolution;
            if (!sol) {
                alert("Primero debes optimizar el problema para exportar el reporte.");
                return;
            }
            title = "Reporte de Optimización Logística y Transporte";
            
            // Build inputs table HTML
            const data = sol.problemData;
            const m = data.costs.length;
            const n = data.costs[0].length;
            
            let tableHeaders = `<th></th>` + data.destNames.map(d => `<th>${d}</th>`).join('') + `<th>Oferta</th>`;
            let tableRows = "";
            for (let i = 0; i < m; i++) {
                tableRows += `<tr><td style="font-weight:bold;">${data.originNames[i]}</td>`;
                for (let j = 0; j < n; j++) {
                    tableRows += `<td>${data.costs[i][j]}</td>`;
                }
                tableRows += `<td style="color:#10b981; font-weight:bold;">${data.supply[i]}</td></tr>`;
            }
            tableRows += `<tr><td style="font-weight:bold;">Demanda</td>` + data.demand.map(d => `<td style="color:#f59e0b; font-weight:bold;">${d}</td>`).join('') + `<td>—</td></tr>`;
            
            inputHtml = `
                <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6">
                    <thead><tr style="background-color:#f1f5f9; color:#1e293b;">${tableHeaders}</tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            
            // Build iterations HTML
            const res = sol.solutionData;
            iterationsHtml = `<ul style="font-size:10px; line-height:1.4; color:#334155; padding-left:20px; font-family:sans-serif;">`;
            res.steps.forEach(step => {
                iterationsHtml += `<li style="margin-bottom:4px;"><strong>Paso ${step.num}:</strong> ${step.text} ➔ Cantidad: ${step.qty} (costo: ${formatCurrency(step.cost)}) | Subtotal: ${formatCurrency(step.subtotal)}</li>`;
            });
            iterationsHtml += `</ul>`;
            
            // Build outputs table HTML
            const rows = res.balancedCosts.length;
            const cols = res.balancedCosts[0].length;
            
            let outHeaders = `<th></th>` + res.destNames.map(d => `<th>${d}</th>`).join('') + `<th>Oferta</th>`;
            let outRows = "";
            for (let i = 0; i < rows; i++) {
                outRows += `<tr><td style="font-weight:bold;">${res.originNames[i]}</td>`;
                for (let j = 0; j < cols; j++) {
                    const qty = res.assignments[i][j];
                    const cost = res.balancedCosts[i][j];
                    if (qty > 0) {
                        outRows += `<td style="background-color:#d1fae5; font-weight:bold; color:#065f46;">${cost} <span style="font-size:10px; color:#047857; font-weight:normal; margin-left:4px;">(${qty} uds)</span></td>`;
                    } else {
                        outRows += `<td>${cost}</td>`;
                    }
                }
                const initialSupply = i < m ? data.supply[i] : res.steps.find(s => s.text.includes(res.originNames[i]))?.qty || 0;
                outRows += `<td>${initialSupply}</td></tr>`;
            }
            outRows += `<tr><td style="font-weight:bold;">Demanda</td>` + res.destNames.map((d, j) => {
                const initialDemand = j < n ? data.demand[j] : res.steps.find(s => s.text.includes(d))?.qty || 0;
                return `<td style="font-weight:bold;">${initialDemand}</td>`;
            }).join('') + `<td>—</td></tr>`;
            
            outputHtml = `
                <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6">
                    <thead><tr style="background-color:#f1f5f9; color:#1e293b;">${outHeaders}</tr></thead>
                    <tbody>${outRows}</tbody>
                </table>
            `;
            
            metricHtml = `
                <div style="display:flex; gap:20px; margin-top:15px; margin-bottom:15px;">
                    <div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#f8fafc; font-family:sans-serif;">
                        <span style="font-size:9px; color:#64748b; font-weight:bold; text-transform:uppercase;">Método Utilizado</span><br>
                        <strong style="font-size:15px; color:#1e293b;">${sol.methodName}</strong>
                    </div>
                    <div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#ecfdf5; font-family:sans-serif;">
                        <span style="font-size:9px; color:#047857; font-weight:bold; text-transform:uppercase;">Costo Total Mínimo</span><br>
                        <strong style="font-size:17px; color:#059669;">${formatCurrency(res.totalCost)}</strong>
                    </div>
                </div>
            `;
            
            aiHtml = document.getElementById('trans-coo-report-text').innerHTML;
            
        } else {
            sol = this.assignmentManager.lastSolution;
            if (!sol) {
                alert("Primero debes optimizar el problema para exportar el reporte.");
                return;
            }
            title = "Reporte de Asignación y Optimización de Talento";
            
            // Build inputs table HTML
            const data = sol.problemData;
            const N = data.matrix.length;
            
            let tableHeaders = `<th></th>` + data.taskNames.map(t => `<th>${t}</th>`).join('');
            let tableRows = "";
            for (let i = 0; i < N; i++) {
                tableRows += `<tr><td style="font-weight:bold;">${data.personNames[i]}</td>`;
                for (let j = 0; j < N; j++) {
                    tableRows += `<td>${data.matrix[i][j]}</td>`;
                }
                tableRows += `</tr>`;
            }
            
            inputHtml = `
                <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6">
                    <thead><tr style="background-color:#f1f5f9; color:#1e293b;">${tableHeaders}</tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            
            // Build iterations HTML
            const res = sol.solutionData;
            iterationsHtml = `<ul style="font-size:10px; line-height:1.4; color:#334155; padding-left:20px; font-family:sans-serif;">`;
            res.assignments.forEach(([r, c]) => {
                const namePerson = data.personNames[r];
                const nameTask = data.taskNames[c];
                const val = data.matrix[r][c];
                iterationsHtml += `<li style="margin-bottom:4px;"><strong>${namePerson}</strong> ➔ asignado a: <strong>${nameTask}</strong> (Valor: ${val})</li>`;
            });
            iterationsHtml += `</ul>`;
            
            // Build outputs table HTML
            let outHeaders = `<th></th>` + data.taskNames.map(t => `<th>${t}</th>`).join('');
            let outRows = "";
            for (let i = 0; i < N; i++) {
                outRows += `<tr><td style="font-weight:bold;">${data.personNames[i]}</td>`;
                for (let j = 0; j < N; j++) {
                    const val = data.matrix[i][j];
                    const isAssigned = res.assignments.some(([ar, ac]) => ar === i && ac === j);
                    if (isAssigned) {
                        outRows += `<td style="background-color:#e0e7ff; font-weight:bold; color:#3730a3; border:2px solid #6366f1;">${val} <span style="font-size:10px; color:#4f46e5; font-weight:normal; margin-left:4px;">(✓)</span></td>`;
                    } else {
                        outRows += `<td>${val}</td>`;
                    }
                }
                outRows += `</tr>`;
            }
            
            outputHtml = `
                <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6">
                    <thead><tr style="background-color:#f1f5f9; color:#1e293b;">${outHeaders}</tr></thead>
                    <tbody>${outRows}</tbody>
                </table>
            `;
            
            metricHtml = `
                <div style="display:flex; gap:20px; margin-top:15px; margin-bottom:15px;">
                    <div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#f8fafc; font-family:sans-serif;">
                        <span style="font-size:9px; color:#64748b; font-weight:bold; text-transform:uppercase;">Objetivo</span><br>
                        <strong style="font-size:15px; color:#1e293b;">${sol.criterion === 'minimize' ? 'Minimizar Costo/Tiempo' : 'Maximizar Aptitud/Talento'}</strong>
                    </div>
                    <div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#e0e7ff; font-family:sans-serif;">
                        <span style="font-size:9px; color:#4f46e5; font-weight:bold; text-transform:uppercase;">Valor Óptimo Evaluado</span><br>
                        <strong style="font-size:17px; color:#4f46e5;">${res.totalValue}</strong>
                    </div>
                </div>
            `;
            
            aiHtml = document.getElementById('assign-coo-report-text').innerHTML;
        }
        
        // Generate temporary printing container
        const tempReport = document.createElement('div');
        tempReport.style.padding = "35px";
        tempReport.style.fontFamily = "Arial, sans-serif";
        tempReport.style.color = "#1e293b";
        tempReport.style.backgroundColor = "#ffffff";
        
        const timestamp = new Date().toLocaleString('es-ES');
        
        tempReport.innerHTML = `
            <!-- Corporate Header -->
            <div style="border-bottom:3px solid #1e3a8a; padding-bottom:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; font-family:sans-serif;">
                <div>
                    <h1 style="margin:0; font-size:24px; color:#1e3a8a; font-weight:bold; letter-spacing:-0.5px;">NexusCore Systems</h1>
                    <span style="font-size:10px; color:#64748b; letter-spacing:1px; font-weight:bold; text-transform:uppercase;">Plataforma de Optimización Operacional</span>
                </div>
                <div style="text-align:right; font-size:9px; color:#64748b; line-height:1.4;">
                    <strong>Documento de Planificación de Operaciones</strong><br>
                    Fecha: ${timestamp}<br>
                    Modelo Analítico: Groq llama-3.1-8b-instant
                </div>
            </div>
            
            <h2 style="font-size:18px; color:#0f172a; margin-top:0; margin-bottom:15px; border-bottom:1px solid #e2e8f0; padding-bottom:5px; font-family:sans-serif; text-transform:uppercase;">${title}</h2>
            
            <!-- Metric summary cards -->
            ${metricHtml}
            
            <!-- Input Table Section -->
            <div style="margin-top:20px;">
                <h3 style="font-size:13px; color:#1e3a8a; margin-bottom:4px; text-transform:uppercase; border-left:3px solid #1e3a8a; padding-left:8px; font-family:sans-serif;">1. Datos de Entrada del Usuario</h3>
                <p style="font-size:10px; color:#64748b; margin-top:2px; margin-bottom:8px; font-family:sans-serif;">Matriz de tarifas y restricciones cargadas en el navegador.</p>
                ${inputHtml}
            </div>
            
            <!-- Iterations Section -->
            <div style="margin-top:25px; page-break-inside:avoid;">
                <h3 style="font-size:13px; color:#1e3a8a; margin-bottom:4px; text-transform:uppercase; border-left:3px solid #1e3a8a; padding-left:8px; font-family:sans-serif;">2. Iteraciones y Pasos de Resolución</h3>
                <p style="font-size:10px; color:#64748b; margin-top:2px; margin-bottom:8px; font-family:sans-serif;">Desglose de los emparejamientos y asignaciones realizados por el algoritmo.</p>
                ${iterationsHtml}
            </div>
            
            <!-- Output Solution Section -->
            <div style="margin-top:25px; page-break-inside:avoid;">
                <h3 style="font-size:13px; color:#1e3a8a; margin-bottom:4px; text-transform:uppercase; border-left:3px solid #1e3a8a; padding-left:8px; font-family:sans-serif;">3. Matriz de Resultados Final</h3>
                <p style="font-size:10px; color:#64748b; margin-top:2px; margin-bottom:8px; font-family:sans-serif;">Flujo óptimo y matriz resultante.</p>
                ${outputHtml}
            </div>
            
            <!-- AI Analysis Section -->
            <div style="margin-top:30px; border-top:1px solid #cbd5e1; padding-top:15px; page-break-inside:avoid;">
                <h3 style="font-size:13px; color:#1e3a8a; margin-bottom:10px; text-transform:uppercase; border-left:3px solid #1e3a8a; padding-left:8px; font-family:sans-serif;">
                    4. Análisis y Conclusión Final (COO / Groq IA)
                </h3>
                <div style="background-color:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:18px; font-size:11px; line-height:1.6; color:#334155; font-family:sans-serif;">
                    ${aiHtml || "<p style='color:#64748b; font-style:italic;'>No se realizó análisis cualitativo mediante Groq para este cálculo.</p>"}
                </div>
            </div>
            
            <!-- Footer -->
            <div style="margin-top:35px; border-top:1px solid #cbd5e1; padding-top:10px; text-align:center; font-size:8px; color:#94a3b8; font-family:sans-serif;">
                Este informe contiene análisis confidencial derivado en tiempo real por NexusCore Systems. © 2026. Todos los derechos reservados.
            </div>
        `;
        
        document.body.appendChild(tempReport);
        
        const opt = {
            margin:       15,
            filename:     `NexusCore_Reporte_${type}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        // Use html2pdf to download
        html2pdf().set(opt).from(tempReport).save().then(() => {
            // Cleanup temp element after saving
            document.body.removeChild(tempReport);
        });
    }
}

// Inicializar la aplicación cuando se cargue el DOM
document.addEventListener('DOMContentLoaded', () => {
    window.nexusCoreApp = new NexusCoreApp();
});
