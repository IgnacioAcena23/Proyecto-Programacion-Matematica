function formatCurrency(val) {
    return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(val);
}

function parseMarkdown(md) {
    let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^###\s+(.*?)$/gm, '<h4>$1</h4>');
    html = html.replace(/^##\s+(.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#\s+(.*?)$/gm, '<h2>$1</h2>');

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

    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
}

class TransportFormManager {
    constructor(app) {
        this.app = app;

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

        this.solverOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                this.solverOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.selectedMethod = opt.dataset.method;
            });
        });

        this.generateGrid();
    }

    generateGrid(preloadData = null) {
        let html = `<table class="matrix-table" id="trans-input-table">`;

        html += `<thead><tr><th></th>`;
        for (let j = 0; j < this.n; j++) {
            const destVal = preloadData ? (preloadData.destNames[j] || `Destino ${j + 1}`) : `Destino ${j + 1}`;
            html += `<th class="header-node"><input type="text" class="node-name-input" value="${destVal}" data-type="dest" data-idx="${j}"></th>`;
        }
        html += `<th class="header-node">Oferta</th></tr></thead><tbody>`;

        for (let i = 0; i < this.m; i++) {
            const originVal = preloadData ? (preloadData.originNames[i] || `Origen ${i + 1}`) : `Origen ${i + 1}`;
            html += `<tr><td class="header-node"><input type="text" class="node-name-input" value="${originVal}" data-type="origin" data-idx="${i}"></td>`;
            for (let j = 0; j < this.n; j++) {
                const costVal = preloadData ? preloadData.costs[i][j] : 0;
                html += `<td><input type="number" class="cell-input cost-cell" value="${costVal}" min="0" data-row="${i}" data-col="${j}"></td>`;
            }
            const supplyVal = preloadData ? preloadData.supply[i] : 0;
            html += `<td class="cell-supply"><input type="number" class="cell-input cell-supply-input" value="${supplyVal}" min="0" data-row="${i}"></td></tr>`;
        }

        html += `<tr><td class="header-node">Demanda</td>`;
        for (let j = 0; j < this.n; j++) {
            const demandVal = preloadData ? preloadData.demand[j] : 0;
            html += `<td class="cell-demand"><input type="number" class="cell-input cell-demand-input" value="${demandVal}" min="0" data-col="${j}"></td>`;
        }
        html += `<td class="dummy">—</td></tr></tbody></td>`;

        this.matrixContainer.innerHTML = html;
        this.resultsPanel.style.display = 'none';
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

        const costs = Array.from({ length: this.m }, () => new Array(this.n).fill(0));
        costInputs.forEach(el => {
            const r = parseInt(el.dataset.row);
            const c = parseInt(el.dataset.col);
            costs[r][c] = parseFloat(el.value) || 0;
        });

        const supply = Array.from({ length: this.m }, (_, i) => parseFloat(supplyInputs[i].value) || 0);
        const demand = Array.from({ length: this.n }, (_, j) => parseFloat(demandInputs[j].value) || 0);

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
        this.app.runAIAnalysis();
    }

    renderResults(res) {
        this.resultsPanel.style.display = 'block';
        document.getElementById('res-total-cost').textContent = formatCurrency(res.totalCost);

        let assignedCount = 0;
        res.assignments.forEach(row => {
            row.forEach(val => { if (val > 0) assignedCount++; });
        });
        document.getElementById('res-cells-count').textContent = assignedCount;
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

            const initialSupply = i < this.m ? this.lastSolution.problemData.supply[i] : res.steps.find(s => s.text.includes(res.originNames[i]))?.qty || 0;
            matrixHtml += `<td class="cell-supply">${initialSupply}</td></tr>`;
        }
        matrixHtml += `<tr><td class="header-node">Demanda</td>`;
        for (let j = 0; j < cols; j++) {
            const isDummyCol = res.dummyColAdded && (j === cols - 1);
            const initialDemand = j < this.n ? this.lastSolution.problemData.demand[j] : res.steps.find(s => s.text.includes(res.destNames[j]))?.qty || 0;
            matrixHtml += `<td class="cell-demand ${isDummyCol ? 'dummy' : ''}">${initialDemand}</td>`;
        }
        matrixHtml += `<td>—</td></tr></tbody></table>`;

        this.resMatrixContainer.innerHTML = matrixHtml;
        this.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }
}

class AssignmentFormManager {
    constructor(app) {
        this.app = app;
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
        this.N = 3;
        this.criterion = 'minimize';
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

        html += `<thead><tr><th></th>`;
        for (let j = 0; j < this.N; j++) {
            const taskName = preloadData ? (preloadData.taskNames[j] || `Tarea ${j + 1}`) : `Tarea ${j + 1}`;
            html += `<th class="header-node"><input type="text" class="node-name-input" value="${taskName}" data-type="task" data-idx="${j}"></th>`;
        }
        html += `</tr></thead><tbody>`;

        for (let i = 0; i < this.N; i++) {
            const personName = preloadData ? (preloadData.personNames[i] || `Talento ${i + 1}`) : `Talento ${i + 1}`;
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

        const matrix = Array.from({ length: this.N }, () => new Array(this.N).fill(0));
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
        this.app.runAIAnalysis();
    }

    renderResults(res, problemData) {
        this.resultsPanel.style.display = 'block';
        this.resValue.textContent = res.totalValue;
        this.resLabel.textContent = this.criterion === 'minimize' ? 'Costo Mínimo Total' : 'Rendimiento Máximo Total';

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

class NexusCoreApp {
    constructor() {
        this.currentView = 'transport';
        this.groqApiKey = "";

        this.transportManager = null;
        this.assignmentManager = null;

        this.init();
    }

    async init() {
        this.transportManager = new TransportFormManager(this);
        this.assignmentManager = new AssignmentFormManager(this);
        this.setupNavigation();
        this.setupAIDrawer();
        this.loadApiKeyFromConfig();
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
        const openDrawer = () => {
            if (overlay && drawer) {
                overlay.classList.add('active');
                drawer.classList.add('active');
            }
        };
        const closeDrawer = () => {
            if (overlay && drawer) {
                overlay.classList.remove('active');
                drawer.classList.remove('active');
            }
        };

        if (btnClose) btnClose.addEventListener('click', closeDrawer);
        if (overlay) overlay.addEventListener('click', closeDrawer);
        if (btnTrigger) btnTrigger.addEventListener('click', () => this.runAIAnalysis());
    }

    loadApiKeyFromConfig() {
        const statusCard = document.getElementById('api-status-card');

        if (typeof window.ENV === 'undefined') {
            console.error("window.ENV no está definido. ¿Se cargó config.js?");
            if (statusCard) statusCard.innerHTML = `<span class="status-dot offline"></span><span class="status-text">Groq IA: config.js no cargado</span>`;
            this.groqApiKey = null;
            return;
        }

        const key = window.ENV.GROQ_API_KEY;
        console.log("Clave encontrada:", key ? key.substring(0, 15) + "..." : "undefined");

        if (key && typeof key === 'string' && key.trim() !== "" && key !== "gsk_TU_CLAVE_API_AQUI" && key.startsWith("gsk_")) {
            this.groqApiKey = key.trim();
            console.log("API key cargada correctamente");
            if (statusCard) statusCard.innerHTML = `<span class="status-dot online"></span><span class="status-text">Groq IA: Conectado</span>`;
        } else {
            console.error("Clave inválida o marcador");
            if (statusCard) statusCard.innerHTML = `<span class="status-dot offline"></span><span class="status-text">Groq IA: Clave inválida</span>`;
            this.groqApiKey = null;
        }
    }

    loadTestCase() {
        if (this.currentView === 'transport') {
            this.transportManager.originsInput.value = 3;
            this.transportManager.destsInput.value = 4;
            this.transportManager.m = 3;
            this.transportManager.n = 4;
            const testData = {
                originNames: ["Planta 1", "Planta 2", "Planta 3"],
                destNames: ["Data Center 1", "Data Center 2", "Data Center 3", "Data Center 4"],
                costs: [[10, 20, 5, 11], [13, 9, 12, 8], [4, 15, 7, 9]],
                supply: [250, 400, 350],
                demand: [200, 300, 250, 250]
            };
            this.transportManager.generateGrid(testData);
        } else {
            this.assignmentManager.sizeInput.value = 4;
            this.assignmentManager.N = 4;
            const testData = {
                personNames: ["Ingeniero 1", "Ingeniero 2", "Ingeniero 3", "Ingeniero 4"],
                taskNames: ["Modulo 1", "Modulo 2", "Modulo 3", "Modulo 4"],
                matrix: [[12, 9, 11, 8], [10, 14, 12, 11], [8, 11, 15, 9], [9, 10, 12, 13]]
            };
            this.assignmentManager.generateGrid(testData);
        }
    }

    async runAIAnalysis() {
        const outputContainer = document.getElementById('ai-output-container');
        let onPageContainer = null, onPageText = null;
        if (this.currentView === 'transport') {
            onPageContainer = document.getElementById('trans-coo-report');
            onPageText = document.getElementById('trans-coo-report-text');
        } else {
            onPageContainer = document.getElementById('assign-coo-report');
            onPageText = document.getElementById('assign-coo-report-text');
        }

        if (!this.groqApiKey) {
            const errorHtml = `<div class="ai-welcome-msg" style="color: var(--danger); text-align: center;">
                 Error: No se encontró la clave API de Groq.<br>
                Asegúrate de que el archivo <code>config.js</code> contenga tu clave real:<br>
                <code>window.ENV = { GROQ_API_KEY: "gsk_tu_clave_real" };</code>
            </div>`;
            outputContainer.innerHTML = errorHtml;
            if (onPageText) onPageText.innerHTML = errorHtml;
            if (onPageContainer) onPageContainer.style.display = 'block';
            return;
        }

        let prompt = "";
        if (this.currentView === 'transport') {
            const sol = this.transportManager.lastSolution;
            if (!sol) { outputContainer.innerHTML = `<div class="ai-welcome-msg">Primero debes resolver el problema.</div>`; return; }
            const dummyText = sol.solutionData.dummyRowAdded ? "Se agregó un origen ficticio" : sol.solutionData.dummyColAdded ? "Se agregó un destino ficticio" : "Balanceado";
            const assignmentsText = sol.solutionData.steps.map(s => ` - ${s.text}: ${s.qty} u a costo ${s.cost} (subtotal ${s.subtotal})`).join('\n');
            prompt = `Eres el COO. Se optimizó transporte con ${sol.methodName}. Datos: Orígenes: ${sol.problemData.originNames.join(', ')}. Destinos: ${sol.problemData.destNames.join(', ')}. Oferta: ${sol.problemData.supply.join(', ')}. Demanda: ${sol.problemData.demand.join(', ')}. Ajuste: ${dummyText}. Asignaciones: ${assignmentsText}. Costo total: ${formatCurrency(sol.solutionData.totalCost)}. Redacta informe ejecutivo (máx 250 palabras) en español, con markdown: 1. Cuellos de botella 2. Riesgos logísticos 3. Balance de carga 4. Recomendación.`;
        } else {
            const sol = this.assignmentManager.lastSolution;
            if (!sol) { outputContainer.innerHTML = `<div class="ai-welcome-msg">Primero debes resolver el problema.</div>`; return; }
            const typeText = sol.criterion === 'minimize' ? 'Minimizar costos' : 'Maximizar talento';
            const assignmentsText = sol.solutionData.assignments.map(([r, c]) => ` - ${sol.problemData.personNames[r]} ➔ ${sol.problemData.taskNames[c]} (Valor: ${sol.problemData.matrix[r][c]})`).join('\n');
            prompt = `Eres el COO. Se optimizó asignación de talento con Algoritmo Húngaro. Objetivo: ${typeText}. Talentos: ${sol.problemData.personNames.join(', ')}. Tareas: ${sol.problemData.taskNames.join(', ')}. Emparejamientos: ${assignmentsText}. Valor total: ${sol.solutionData.totalValue}. Redacta informe ejecutivo (máx 250 palabras) en español, con markdown: 1. Impacto operacional 2. Riesgos 3. Balance de cargas 4. Recomendación.`;
        }

        const loadingHtml = `<div style="text-align:center; padding:20px 0;"><div class="spinner"></div><p>Analizando con Groq...</p></div>`;
        outputContainer.innerHTML = loadingHtml;
        if (onPageText) onPageText.innerHTML = loadingHtml;
        if (onPageContainer) onPageContainer.style.display = 'block';

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${this.groqApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: prompt }], max_tokens: 500, temperature: 0.3 })
            });
            if (!response.ok) { let err = await response.json().catch(() => ({})); throw new Error(err.error?.message || `HTTP ${response.status}`); }
            const result = await response.json();
            const aiText = result.choices[0].message.content.trim();
            const parsedHtml = parseMarkdown(aiText);
            outputContainer.innerHTML = `<div class="ai-response-text">${parsedHtml}</div>`;
            if (onPageText) onPageText.innerHTML = parsedHtml;
        } catch (e) {
            const errorMsg = `<div style="color:var(--danger);"> Error: ${e.message}</div>`;
            outputContainer.innerHTML = errorMsg;
            if (onPageText) onPageText.innerHTML = errorMsg;
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
            if (!sol) { alert("Primero debes optimizar el problema."); return; }
            title = "Reporte de Optimización Logística y Transporte";

            const data = sol.problemData;
            const m = data.costs.length;
            const n = data.costs[0].length;

            // Tabla de entrada (datos originales)
            let tableHeaders = `<th></th>` + data.destNames.map(d => `<th>${d}</th>`).join('') + `<th>Oferta</th>`;
            let tableRows = "";
            for (let i = 0; i < m; i++) {
                tableRows += `<tr><td style="font-weight:bold;">${data.originNames[i]}</td>`;
                for (let j = 0; j < n; j++) tableRows += `<td>${data.costs[i][j]}</td>`;
                tableRows += `<td style="color:#10b981; font-weight:bold;">${data.supply[i]}</td>`;
            }
            tableRows += `<tr><td style="font-weight:bold;">Demanda</td>` + data.demand.map(d => `<td style="color:#f59e0b; font-weight:bold;">${d}</td>`).join('') + `<td>—</td>`;
            inputHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6"><thead><tr style="background-color:#f1f5f9; color:#1e293b;">${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table>`;

            // Iteraciones
            const res = sol.solutionData;
            iterationsHtml = `<ul style="font-size:10px; line-height:1.4; color:#334155; padding-left:20px;">`;
            res.steps.forEach(step => {
                iterationsHtml += `<li style="margin-bottom:4px;"><strong>Paso ${step.num}:</strong> ${step.text} ➔ Cantidad: ${step.qty} (costo: ${formatCurrency(step.cost)}) | Subtotal: ${formatCurrency(step.subtotal)}</li>`;
            });
            iterationsHtml += `</ul>`;

            // Tabla de resultados (solo una tabla)
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
                        outRows += `<td style="background-color:#d1fae5; font-weight:bold; color:#065f46;">${cost} <span style="font-size:10px;">(${qty} uds)</span></td>`;
                    } else {
                        outRows += `<td>${cost}</td>`;
                    }
                }
                const initialSupply = i < m ? data.supply[i] : res.steps.find(s => s.text.includes(res.originNames[i]))?.qty || 0;
                outRows += `<td style="color:#10b981; font-weight:bold;">${initialSupply}</td>`;
            }
            outRows += `<tr><td style="font-weight:bold;">Demanda</td>` + res.destNames.map((d, j) => {
                const initialDemand = j < n ? data.demand[j] : res.steps.find(s => s.text.includes(d))?.qty || 0;
                return `<td style="color:#f59e0b; font-weight:bold;">${initialDemand}</td>`;
            }).join('') + `<td>—</td>`;
            outputHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6"><thead><tr style="background-color:#f1f5f9; color:#1e293b;">${outHeaders}</tr></thead><tbody>${outRows}</tbody></table>`;

            metricHtml = `<div style="display:flex; gap:20px; margin:15px 0;"><div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#f8fafc;"><span style="font-size:9px; color:#64748b; font-weight:bold;">Método Utilizado</span><br><strong style="font-size:15px;">${sol.methodName}</strong></div><div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#ecfdf5;"><span style="font-size:9px; color:#047857; font-weight:bold;">Costo Total Mínimo</span><br><strong style="font-size:17px; color:#059669;">${formatCurrency(res.totalCost)}</strong></div></div>`;
            aiHtml = document.getElementById('trans-coo-report-text').innerHTML;
        } else {
            // Asignación (similar, pero sin cambios necesarios)
            sol = this.assignmentManager.lastSolution;
            if (!sol) { alert("Primero debes optimizar el problema."); return; }
            title = "Reporte de Asignación y Optimización de Talento";

            const data = sol.problemData;
            const N = data.matrix.length;
            let tableHeaders = `<th></th>` + data.taskNames.map(t => `<th>${t}</th>`).join('');
            let tableRows = "";
            for (let i = 0; i < N; i++) {
                tableRows += `<tr><td style="font-weight:bold;">${data.personNames[i]}</td>`;
                for (let j = 0; j < N; j++) tableRows += `<td>${data.matrix[i][j]}</td>`;
                tableRows += `</tr>`;
            }
            inputHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6"><thead><tr style="background-color:#f1f5f9; color:#1e293b;">${tableHeaders}<tr></thead><tbody>${tableRows}</tbody></table>`;

            const res = sol.solutionData;
            iterationsHtml = `<ul style="font-size:10px; line-height:1.4; color:#334155; padding-left:20px;">`;
            res.assignments.forEach(([r, c]) => {
                const namePerson = data.personNames[r];
                const nameTask = data.taskNames[c];
                const val = data.matrix[r][c];
                iterationsHtml += `<li style="margin-bottom:4px;"><strong>${namePerson}</strong> ➔ asignado a: <strong>${nameTask}</strong> (Valor: ${val})</li>`;
            });
            iterationsHtml += `</ul>`;

            let outHeaders = `<th></th>` + data.taskNames.map(t => `<th>${t}</th>`).join('');
            let outRows = "";
            for (let i = 0; i < N; i++) {
                outRows += `<tr><td style="font-weight:bold;">${data.personNames[i]}</td>`;
                for (let j = 0; j < N; j++) {
                    const val = data.matrix[i][j];
                    const isAssigned = res.assignments.some(([ar, ac]) => ar === i && ac === j);
                    if (isAssigned) outRows += `<td style="background-color:#e0e7ff; font-weight:bold; border:2px solid #6366f1;">${val} ✓</td>`;
                    else outRows += `<td>${val}</td>`;
                }
                outRows += `</tr>`;
            }
            outputHtml = `<table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; border:1px solid #cbd5e1;" border="1" cellpadding="6"><thead><tr style="background-color:#f1f5f9; color:#1e293b;">${outHeaders}</tr></thead><tbody>${outRows}</tbody></table>`;

            metricHtml = `<div style="display:flex; gap:20px; margin:15px 0;"><div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#f8fafc;"><span style="font-size:9px; color:#64748b; font-weight:bold;">Objetivo</span><br><strong>${sol.criterion === 'minimize' ? 'Minimizar Costo/Tiempo' : 'Maximizar Aptitud/Talento'}</strong></div><div style="flex:1; border:1px solid #cbd5e1; padding:12px; border-radius:6px; background-color:#e0e7ff;"><span style="font-size:9px; color:#4f46e5; font-weight:bold;">Valor Óptimo Evaluado</span><br><strong style="font-size:17px; color:#4f46e5;">${res.totalValue}</strong></div></div>`;
            aiHtml = document.getElementById('assign-coo-report-text').innerHTML;
        }

        // Construir HTML completo para la ventana emergente
        const timestamp = new Date().toLocaleString('es-ES');
        const fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title} - NexusCore Systems</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            background-color: #ffffff;
            color: #1e293b;
            padding: 35px;
            max-width: 800px;
            margin: 0 auto;
        }
        h1 { font-size: 24px; color: #1e3a8a; margin-bottom: 5px; }
        .subtitle { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
        .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .title-section h2 { font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 0; margin-bottom: 15px; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; border: 1px solid #cbd5e1; }
        th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: center; }
        th { background-color: #f1f5f9; font-weight: bold; }
        .flex { display: flex; gap: 20px; margin: 15px 0; }
        .assigned-cell { background-color: #d1fae5; font-weight: bold; color: #065f46; }
        .assigned-cell-indigo { background-color: #e0e7ff; font-weight: bold; border: 2px solid #6366f1; }
        ul { font-size: 10px; line-height: 1.4; color: #334155; padding-left: 20px; margin: 8px 0; }
        li { margin-bottom: 4px; }
        .footer { margin-top: 35px; border-top: 1px solid #cbd5e1; padding-top: 10px; text-align: center; font-size: 8px; color: #94a3b8; }
        #status { text-align: center; margin-top: 20px; font-size: 12px; color: #059669; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>NexusCore Systems</h1>
            <div class="subtitle">Plataforma de Optimización Operacional</div>
        </div>
        <div style="text-align:right; font-size:9px; color:#64748b;">
            <strong>Documento de Planificación de Operaciones</strong><br>
            Fecha: ${timestamp}<br>
            Modelo Analítico: Groq llama-3.1-8b-instant
        </div>
    </div>
    <div class="title-section">
        <h2>${title}</h2>
    </div>
    ${metricHtml}
    <h3>1. Datos de Entrada del Usuario</h3>
    <p style="font-size:10px; color:#64748b; margin-bottom:8px;">Matriz de tarifas y restricciones cargadas en el navegador.</p>
    ${inputHtml}
    <h3>2. Iteraciones y Pasos de Resolución</h3>
    <p style="font-size:10px; color:#64748b; margin-bottom:8px;">Desglose de los emparejamientos y asignaciones realizados por el algoritmo.</p>
    ${iterationsHtml}
    <h3>3. Matriz de Resultados Final</h3>
    <p style="font-size:10px; color:#64748b; margin-bottom:8px;">Flujo óptimo y matriz resultante.</p>
    ${outputHtml}
    <h3 style="page-break-before: always;">4. Análisis y Conclusión Final (COO / Groq IA)</h3>
    <div style="background-color:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:18px; font-size:11px; line-height:1.6; color:#334155; page-break-inside: avoid;">
        ${aiHtml || "<p style='color:#64748b; font-style:italic;'>No se realizó análisis cualitativo mediante Groq para este cálculo.</p>"}
    </div>
    <div class="footer">
        Este informe contiene análisis confidencial derivado en tiempo real por NexusCore Systems. © 2026. Todos los derechos reservados.
    </div>
    <script>
        window.onload = function() {
            const element = document.body;
            const opt = {
                margin: 15,
                filename: 'NexusCore_Reporte_${type}_${new Date().toISOString().slice(0, 19)}.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(element).save().then(() => {
                document.getElementById('status').innerHTML = 'PDF generado correctamente. Cerrando ventana...';
                setTimeout(() => window.close(), 1500);
            }).catch(err => {
                document.getElementById('status').innerHTML = 'Error al generar PDF: ' + err.message;
                console.error(err);
            });
        };
    </script>
</body>
</html>
    `;

        const pdfWindow = window.open('', '_blank');
        if (!pdfWindow) {
            alert("Por favor, permite ventanas emergentes para generar el PDF.");
            return;
        }
        pdfWindow.document.write(fullHtml);
        pdfWindow.document.close();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.nexusCoreApp = new NexusCoreApp();
});