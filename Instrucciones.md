# NexusCore Systems - Manual de Usuario e Instrucciones

¡Bienvenido a **NexusCore Systems**! Esta es una plataforma web dinámica e interactiva diseñada para la resolución y análisis de problemas de programación lineal aplicados a la **logística de transporte** y la **optimización de asignación de talento**.

---

## 🚀 Cómo Ejecutar la Aplicación

La aplicación está construida utilizando estándares web puros (HTML5, CSS3, JavaScript ES6) sin dependencias complejas. Tienes dos formas de ejecutarla:

### Opción 1: Servidor Local (Recomendada para usar IA)
Para permitir que la aplicación cargue la clave API de Groq automáticamente desde el archivo `.env` sin restricciones de seguridad de archivos locales (CORS):
1. Abre tu terminal en la carpeta del proyecto:
   ```bash
   npx serve ./
   ```
   *O alternativamente con Python:*
   ```bash
   python -m http.server 8000
   ```
2. Abre en tu navegador la dirección indicada (ej. `http://localhost:3000` o `http://localhost:8000`).

### Opción 2: Archivo Local Directo
Simplemente haz doble clic en el archivo [index.html](file:///c:/Users/usuario/Desktop/Programación%20Matem%C3%A1tica/Proyecto-Programacion-Matematica/index.html) para abrirlo en cualquier navegador moderno. 
*Nota: Si utilizas este método, deberás ingresar manualmente tu clave API de Groq en el panel de la IA (si deseas usarla), ya que el navegador bloquea la lectura del archivo `.env` local por seguridad.*

---

## 🛠️ Funcionalidades del Sistema

### 1. Logística de Transporte (Frontera de Distribución)
*   **Entradas Variables**: Define dinámicamente el número de Orígenes ($m$) y Destinos ($n$) mediante el formulario adaptativo.
*   **Validación de Balanceo en Tiempo Real**: El sistema evalúa instantáneamente si la Oferta Total es igual a la Demanda Total:
    *   Si $\sum \text{Oferta} > \sum \text{Demanda}$, se añade automáticamente una columna **Ficticia** con costo unitario de cero.
    *   Si $\sum \text{Demanda} > \sum \text{Oferta}$, se añade automáticamente una fila **Ficticia** con costo unitario de cero.
*   **Tres Solvers Disponibles**:
    1.  **Esquina Noroeste**: Algoritmo rápido que realiza asignaciones partiendo de la esquina superior izquierda.
    2.  **Costo Mínimo**: Prioriza la asignación de flujos en las rutas con menor tarifa global.
    3.  **Aproximación de Vogel (VAM)**: Calcula penalidades de oportunidad por filas y columnas para aproximar de forma óptima la solución inicial.

### 2. Optimización de Asignación de Talento
*   **Matriz Cuadrada ($N \times N$)**: Configura cuadrículas interactivas para asociar talento humano con tareas o puestos de trabajo.
*   **Algoritmo Húngaro Exacto**: Resuelve el modelo clásico en tiempo polinomial exacto.
*   **Criterio Dual**: Permite alternar entre:
    *   **Minimizar Costos**: Reduce tiempos o gastos de operación.
    *   **Maximizar Talento**: Maximiza puntuaciones de compatibilidad y rendimiento de aptitudes.

---

## 📊 Casos de Prueba Incluidos

Puedes cargar estos casos de prueba directamente haciendo clic en el botón **"Cargar Caso de Prueba"** del encabezado según la pestaña en la que te encuentres.

### Caso de Prueba 1: Transporte Desbalanceado ($5 \times 5$)
Este escenario base representa una cadena de suministro con un desbalance del sistema (Demanda = 300, Oferta = 250):

*   **Matriz de Costos unitarios ($C_{ij}$):**
    | Planta / Centro | GDL | CDMX | MTY | PUE | QRO | Oferta |
    | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
    | **Norte** | 4 | 6 | 8 | 5 | 6 | **50** |
    | **Sur** | 3 | 7 | 6 | 3 | 2 | **60** |
    | **Este** | 3 | 5 | 4 | 2 | 8 | **40** |
    | **Oeste** | 2 | 8 | 4 | 6 | 6 | **30** |
    | **Centro** | 9 | 7 | 5 | 4 | 6 | **70** |
    | **Demanda** | **40** | **60** | **50** | **60** | **90** | |

*Al presionar "Calcular Solución", el sistema balancea la matriz agregando automáticamente el origen ficticio necesario con costos cero para cubrir el diferencial de demanda (50).*

---

### Caso de Prueba 2: Asignación de Talento ($4 \times 4$)
Matriz de afinidad de talento para asignación óptima de ingenieros a proyectos estratégicos (maximización de aptitudes):

*   **Matriz de Aptitudes (Puntaje de 0 a 100):**
    | Ingeniero / Proyecto | Liderazgo I+D | Desarrollo Cloud | Análisis Datos | Soporte DevOps |
    | :--- | :---: | :---: | :---: | :---: |
    | **Ing. Carlos** | 90 | 85 | 75 | 60 |
    | **Dra. Sofía** | 85 | 95 | 80 | 70 |
    | **Msc. Daniel** | 70 | 80 | 85 | 90 |
    | **Tec. Lucía** | 65 | 75 | 80 | 95 |

*El sistema calcula la distribución que produce la máxima eficiencia total empleando el método húngaro.*

---

## 🤖 Módulo de Inteligencia Artificial (Groq)
La plataforma incluye un panel lateral de análisis que se conecta con la API de Groq para interpretar y evaluar de manera estratégica el plan de distribución resultante. 
*   **Llamadas directas desde el cliente**: Envía la estructura matemática del problema resuelto al modelo `llama-3.1-8b-instant`.
*   **Análisis estratégico**: Explica la lógica detrás de las rutas elegidas y recomienda optimizaciones adicionales (ej. método MODI o Stepping-Stone).