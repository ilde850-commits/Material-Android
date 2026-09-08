MATERIAL MÓVIL v1.3

Versión móvil/PWA de consulta para GitHub Pages, adaptada a la estructura de material.db v9.12.

CAMBIOS v1.3
- Adaptación a tablas reales: articles, technical_sheets, kits/components, clients, cranes, catalogs, advertising_sheets y suppliers.
- Muestra el nombre del proveedor y oculta ID/proveedor_id.
- En Artículos, el PDF se busca por CODIGO_BARRAS.pdf (regla confirmada).
- Una única carpeta pdf para todos los documentos.
- Botón visible “Abrir PDF” dentro de la ficha cuando se localiza el documento.
- Descripción/Modelo/Nombre actúan como enlace al PDF cuando está disponible.
- Kits muestran su composición.

NOTA
La base de datos de ejemplo no guarda columnas con ruta/nombre de PDF para Fichas, Grúas, Catálogos o Fichas publicitarias. Por ello la app prueba automáticamente las convenciones habituales (id, referencia, modelo/nombre, código de barras y prefijos). Si algún PDF de esas secciones no se localiza, basta comprobar el nombre real con el que lo guarda el programa de PC para afinar la regla sin compartir datos sensibles.
