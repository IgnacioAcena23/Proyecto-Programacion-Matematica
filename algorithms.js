/**
 * NexusCore Systems - Optimización de Logística y Talento
 * algorithms.js - Contiene los modelos y solvers para transporte y asignación.
 */

// =============================================================================
//  CLASES DE LOGÍSTICA DE TRANSPORTE
// =============================================================================

class TransportProblem {
    constructor(costs, supply, demand, originNames = null, destNames = null) {
        this.costs = costs.map(row => [...row]); // Matriz m x n
        this.supply = [...supply];               // Capacidad de orígenes
        this.demand = [...demand];               // Demanda de destinos
        
        this.m = costs.length;
        this.n = costs[0].length;

        // Nombres predeterminados si no se ingresan
        this.originNames = originNames ? [...originNames] : Array.from({length: this.m}, (_, i) => `Origen ${i + 1}`);
        this.destNames = destNames ? [...destNames] : Array.from({length: this.n}, (_, j) => `Destino ${j + 1}`);
    }

    isBalanced() {
        const sumSupply = this.supply.reduce((a, b) => a + b, 0);
        const sumDemand = this.demand.reduce((a, b) => a + b, 0);
        return Math.abs(sumSupply - sumDemand) < 0.0001;
    }

    getBalancedData() {
        const sumSupply = this.supply.reduce((a, b) => a + b, 0);
        const sumDemand = this.demand.reduce((a, b) => a + b, 0);

        let balancedCosts = this.costs.map(row => [...row]);
        let balancedSupply = [...this.supply];
        let balancedDemand = [...this.demand];
        let balancedOrigins = [...this.originNames];
        let balancedDests = [...this.destNames];
        
        let dummyRowAdded = false;
        let dummyColAdded = false;

        if (sumSupply > sumDemand) {
            // Oferta > Demanda -> Agregar destino ficticio
            const diff = sumSupply - sumDemand;
            balancedDemand.push(diff);
            balancedDests.push("Destino Ficticio");
            for (let i = 0; i < this.m; i++) {
                balancedCosts[i].push(0); // Costo cero a destino ficticio
            }
            dummyColAdded = true;
        } else if (sumDemand > sumSupply) {
            // Demanda > Oferta -> Agregar origen ficticio
            const diff = sumDemand - sumSupply;
            balancedSupply.push(diff);
            balancedOrigins.push("Origen Ficticio");
            balancedCosts.push(new Array(this.n).fill(0)); // Costo cero desde origen ficticio
            dummyRowAdded = true;
        }

        return {
            costs: balancedCosts,
            supply: balancedSupply,
            demand: balancedDemand,
            originNames: balancedOrigins,
            destNames: balancedDests,
            dummyRowAdded,
            dummyColAdded
        };
    }
}

class NorthwestCornerSolver {
    static solve(problem) {
        const data = problem.getBalancedData();
        const rows = data.costs.length;
        const cols = data.costs[0].length;
        
        const assignments = Array.from({length: rows}, () => new Array(cols).fill(0));
        const steps = [];
        
        let of = [...data.supply];
        let dem = [...data.demand];
        
        let i = 0, j = 0;
        let stepCount = 1;
        
        while (i < rows && j < cols) {
            const qty = Math.min(of[i], dem[j]);
            assignments[i][j] = qty;
            
            steps.push({
                num: stepCount++,
                text: `${data.originNames[i]} ➔ ${data.destNames[j]}`,
                qty: qty,
                cost: data.costs[i][j],
                subtotal: qty * data.costs[i][j],
                detail: `Asignado min(Oferta=${of[i] + qty}, Demanda=${dem[j] + qty}) = ${qty}`
            });
            
            of[i] -= qty;
            dem[j] -= qty;
            
            if (of[i] === 0) i++;
            if (dem[j] === 0) j++;
        }
        
        const totalCost = assignments.reduce((sum, row, r) => {
            return sum + row.reduce((rowSum, val, c) => rowSum + (val * data.costs[r][c]), 0);
        }, 0);

        return {
            assignments,
            totalCost,
            steps,
            balancedCosts: data.costs,
            originNames: data.originNames,
            destNames: data.destNames,
            dummyRowAdded: data.dummyRowAdded,
            dummyColAdded: data.dummyColAdded
        };
    }
}

class LeastCostSolver {
    static solve(problem) {
        const data = problem.getBalancedData();
        const rows = data.costs.length;
        const cols = data.costs[0].length;
        
        const assignments = Array.from({length: rows}, () => new Array(cols).fill(0));
        const steps = [];
        
        let of = [...data.supply];
        let dem = [...data.demand];
        
        const rowsTachadas = new Set();
        const colsTachadas = new Set();
        let stepCount = 1;

        while (rowsTachadas.size < rows && colsTachadas.size < cols) {
            let minCosto = Infinity;
            let fMin = -1, cMin = -1;
            
            // Buscar la celda con menor costo activa
            for (let r = 0; r < rows; r++) {
                if (rowsTachadas.has(r)) continue;
                for (let c = 0; c < cols; c++) {
                    if (colsTachadas.has(c)) continue;
                    if (data.costs[r][c] < minCosto) {
                        minCosto = data.costs[r][c];
                        fMin = r;
                        cMin = c;
                    }
                }
            }
            
            if (fMin === -1) break;
            
            const qty = Math.min(of[fMin], dem[cMin]);
            assignments[fMin][cMin] = qty;
            
            steps.push({
                num: stepCount++,
                text: `${data.originNames[fMin]} ➔ ${data.destNames[cMin]}`,
                qty: qty,
                cost: minCosto,
                subtotal: qty * minCosto,
                detail: `Costo mínimo global encontrado: ${minCosto}. Se asignaron ${qty} unidades.`
            });
            
            of[fMin] -= qty;
            dem[cMin] -= qty;
            
            if (of[fMin] === 0 && dem[cMin] === 0) {
                // Convención: tachar fila
                rowsTachadas.add(fMin);
            } else if (of[fMin] === 0) {
                rowsTachadas.add(fMin);
            } else {
                colsTachadas.add(cMin);
            }
        }

        const totalCost = assignments.reduce((sum, row, r) => {
            return sum + row.reduce((rowSum, val, c) => rowSum + (val * data.costs[r][c]), 0);
        }, 0);

        return {
            assignments,
            totalCost,
            steps,
            balancedCosts: data.costs,
            originNames: data.originNames,
            destNames: data.destNames,
            dummyRowAdded: data.dummyRowAdded,
            dummyColAdded: data.dummyColAdded
        };
    }
}

class VogelSolver {
    static solve(problem) {
        const data = problem.getBalancedData();
        const rows = data.costs.length;
        const cols = data.costs[0].length;
        
        const assignments = Array.from({length: rows}, () => new Array(cols).fill(0));
        const steps = [];
        
        let of = [...data.supply];
        let dem = [...data.demand];
        
        let activeRows = Array.from({length: rows}, (_, i) => i);
        let activeCols = Array.from({length: cols}, (_, j) => j);
        let stepCount = 1;

        const getRowPenalty = (r, currentActiveCols) => {
            const vals = currentActiveCols.map(c => data.costs[r][c]).sort((a, b) => a - b);
            return vals.length >= 2 ? vals[1] - vals[0] : 0;
        };

        const getColPenalty = (c, currentActiveRows) => {
            const vals = currentActiveRows.map(r => data.costs[r][c]).sort((a, b) => a - b);
            return vals.length >= 2 ? vals[1] - vals[0] : 0;
        };

        while (activeRows.length > 0 && activeCols.length > 0) {
            let maxPenalty = -1;
            let targetIdx = -1;
            let targetType = ""; // "R" (fila) o "C" (columna)
            
            // Calcular penalidades para filas activas
            for (const r of activeRows) {
                const p = getRowPenalty(r, activeCols);
                if (p > maxPenalty) {
                    maxPenalty = p;
                    targetIdx = r;
                    targetType = "R";
                }
            }
            
            // Calcular penalidades para columnas activas
            for (const c of activeCols) {
                const p = getColPenalty(c, activeRows);
                if (p > maxPenalty) {
                    maxPenalty = p;
                    targetIdx = c;
                    targetType = "C";
                }
            }
            
            let fMin = -1, cMin = -1;
            
            if (targetType === "R") {
                fMin = targetIdx;
                // Encontrar la columna activa con menor costo en esa fila
                let minVal = Infinity;
                for (const c of activeCols) {
                    if (data.costs[fMin][c] < minVal) {
                        minVal = data.costs[fMin][c];
                        cMin = c;
                    }
                }
            } else {
                cMin = targetIdx;
                // Encontrar la fila activa con menor costo en esa columna
                let minVal = Infinity;
                for (const r of activeRows) {
                    if (data.costs[r][cMin] < minVal) {
                        minVal = data.costs[r][cMin];
                        fMin = r;
                    }
                }
            }

            if (fMin === -1 || cMin === -1) break;

            const qty = Math.min(of[fMin], dem[cMin]);
            assignments[fMin][cMin] = qty;
            
            steps.push({
                num: stepCount++,
                text: `${data.originNames[fMin]} ➔ ${data.destNames[cMin]}`,
                qty: qty,
                cost: data.costs[fMin][cMin],
                subtotal: qty * data.costs[fMin][cMin],
                detail: `Penalidad máxima en ${targetType === "R" ? "fila" : "columna"} ${data.originNames[fMin] || data.destNames[cMin]} = ${maxPenalty}. Asignado: ${qty} unidades.`
            });
            
            of[fMin] -= qty;
            dem[cMin] -= qty;
            
            if (of[fMin] === 0) {
                activeRows = activeRows.filter(r => r !== fMin);
            }
            if (dem[cMin] === 0) {
                activeCols = activeCols.filter(c => c !== cMin);
            }
        }

        const totalCost = assignments.reduce((sum, row, r) => {
            return sum + row.reduce((rowSum, val, c) => rowSum + (val * data.costs[r][c]), 0);
        }, 0);

        return {
            assignments,
            totalCost,
            steps,
            balancedCosts: data.costs,
            originNames: data.originNames,
            destNames: data.destNames,
            dummyRowAdded: data.dummyRowAdded,
            dummyColAdded: data.dummyColAdded
        };
    }
}


// =============================================================================
//  CLASE DE OPTIMIZACIÓN DE TALENTO (ASIGNACIÓN)
// =============================================================================

class HungarianSolver {
    static solve(originalMatrix, isMaximization = false) {
        const N = originalMatrix.length;
        let matrix = originalMatrix.map(row => [...row]);
        const steps = [];
        
        // ── TRANSFORMACIÓN PARA MAXIMIZACIÓN ──
        if (isMaximization) {
            let maxVal = -Infinity;
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < N; j++) {
                    if (matrix[i][j] > maxVal) maxVal = matrix[i][j];
                }
            }
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < N; j++) {
                    matrix[i][j] = maxVal - matrix[i][j];
                }
            }
            steps.push({
                name: "Transformación de Maximización",
                detail: `Se restaron todos los elementos del valor máximo global (${maxVal}) para convertir a minimización.`
            });
        } else {
            steps.push({
                name: "Carga de Matriz de Costos",
                detail: `Matriz cargada correctamente para minimizar.`
            });
        }
        
        // ── PASO 1: REDUCCIÓN DE FILAS ──
        for (let i = 0; i < N; i++) {
            const minVal = Math.min(...matrix[i]);
            if (minVal > 0) {
                for (let j = 0; j < N; j++) {
                    matrix[i][j] -= minVal;
                }
                steps.push({
                    name: `Reducción de Fila ${i + 1}`,
                    detail: `Se restó el valor mínimo de la fila (${minVal}) a todas sus celdas.`
                });
            }
        }
        
        // ── PASO 2: REDUCCIÓN DE COLUMNAS ──
        for (let j = 0; j < N; j++) {
            let minVal = Infinity;
            for (let i = 0; i < N; i++) {
                if (matrix[i][j] < minVal) minVal = matrix[i][j];
            }
            if (minVal > 0 && minVal !== Infinity) {
                for (let i = 0; i < N; i++) {
                    matrix[i][j] -= minVal;
                }
                steps.push({
                    name: `Reducción de Columna ${j + 1}`,
                    detail: `Se restó el valor mínimo de la columna (${minVal}) a todas sus celdas.`
                });
            }
        }
        
        // ── BUCLE PRINCIPAL DE COBERTURA Y AJUSTE ──
        let matchedRow = new Array(N).fill(-1); // matchedRow[c] = r
        let matchedCol = new Array(N).fill(-1); // matchedCol[r] = c
        let iteration = 0;
        const MAX_ITER = 100;
        
        while (iteration < MAX_ITER) {
            iteration++;
            
            // Emparejamiento Bipartito Máximo
            const matchCount = this.maxBipartiteMatching(matrix, matchedRow, matchedCol);
            
            if (matchCount === N) {
                steps.push({
                    name: "Asignación Final Encontrada",
                    detail: `Se logró realizar un emparejamiento perfecto (${matchCount} asignaciones) con costo marginal cero.`
                });
                break;
            }
            
            // Teorema de Koenig para encontrar líneas de cobertura mínimas
            let markedRows = new Array(N).fill(false);
            let markedCols = new Array(N).fill(false);
            
            // 1. Marcar filas sin emparejamiento
            for (let i = 0; i < N; i++) {
                if (matchedCol[i] === -1) {
                    markedRows[i] = true;
                }
            }
            
            // 2. Marcar de manera recursiva
            let changed = true;
            while (changed) {
                changed = false;
                
                // Si fila marcada tiene cero en col no marcada, marcar col
                for (let r = 0; r < N; r++) {
                    if (markedRows[r]) {
                        for (let c = 0; c < N; c++) {
                            if (matrix[r][c] === 0 && !markedCols[c]) {
                                markedCols[c] = true;
                                changed = true;
                            }
                        }
                    }
                }
                
                // Si col marcada está emparejada a fila no marcada, marcar fila
                for (let c = 0; c < N; c++) {
                    if (markedCols[c]) {
                        const r = matchedRow[c];
                        if (r !== -1 && !markedRows[r]) {
                            markedRows[r] = true;
                            changed = true;
                        }
                    }
                }
            }
            
            // Líneas de cobertura: filas no marcadas + columnas marcadas
            let numLines = 0;
            const coverLines = [];
            for (let i = 0; i < N; i++) {
                if (!markedRows[i]) {
                    numLines++;
                    coverLines.push(`Fila ${i + 1}`);
                }
                if (markedCols[i]) {
                    numLines++;
                    coverLines.push(`Columna ${i + 1}`);
                }
            }
            
            // Buscar el menor elemento no cubierto (fila marcada, columna no marcada)
            let minUncovered = Infinity;
            for (let r = 0; r < N; r++) {
                if (markedRows[r]) {
                    for (let c = 0; c < N; c++) {
                        if (!markedCols[c]) {
                            if (matrix[r][c] < minUncovered) {
                                minUncovered = matrix[r][c];
                            }
                        }
                    }
                }
            }
            
            if (minUncovered === Infinity || minUncovered === 0) {
                break;
            }
            
            // ── AJUSTE DE LA MATRIZ ──
            // Restar a filas marcadas, sumar a columnas marcadas
            for (let r = 0; r < N; r++) {
                if (markedRows[r]) {
                    for (let c = 0; c < N; c++) {
                        matrix[r][c] -= minUncovered;
                    }
                }
            }
            for (let c = 0; c < N; c++) {
                if (markedCols[c]) {
                    for (let r = 0; r < N; r++) {
                        matrix[r][c] += minUncovered;
                    }
                }
            }
            
            steps.push({
                name: `Iteración ${iteration}: Ajuste matricial`,
                detail: `Cobertura con ${numLines} líneas (${coverLines.join(', ')}). Menor no cubierto: ${minUncovered}.`
            });
        }
        
        // ── PREPARAR RESULTADO FINAL ──
        const assignments = [];
        let totalValue = 0;
        for (let r = 0; r < N; r++) {
            const c = matchedCol[r];
            if (c !== -1) {
                assignments.push([r, c]);
                totalValue += originalMatrix[r][c];
            }
        }
        
        return {
            assignments,
            totalValue,
            steps
        };
    }
    
    // DFS para emparejamiento bipartito
    static maxBipartiteMatching(matrix, matchedRow, matchedCol) {
        const N = matrix.length;
        matchedRow.fill(-1);
        matchedCol.fill(-1);
        
        let matchCount = 0;
        for (let r = 0; r < N; r++) {
            let seen = new Array(N).fill(false);
            if (this.dfsMatch(r, matrix, seen, matchedRow, matchedCol)) {
                matchCount++;
            }
        }
        return matchCount;
    }
    
    static dfsMatch(r, matrix, seen, matchedRow, matchedCol) {
        const N = matrix.length;
        for (let c = 0; c < N; c++) {
            if (matrix[r][c] === 0 && !seen[c]) {
                seen[c] = true;
                const matchR = matchedRow[c];
                if (matchR === -1 || this.dfsMatch(matchR, matrix, seen, matchedRow, matchedCol)) {
                    matchedRow[c] = r;
                    matchedCol[r] = c;
                    return true;
                }
            }
        }
        return false;
    }
}
