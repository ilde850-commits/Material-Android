MATERIAL MOVIL v1
=================

PWA de consulta para una base SQLite material.db.

FUNCIONES
- Importar/actualizar material.db desde el telefono.
- La base se guarda localmente en IndexedDB.
- Detecta automaticamente tablas y columnas SQLite.
- Secciones móviles para Articulos, Fichas tecnicas, Kits, Clientes, Gruas, Catalogos y Fichas publicitarias cuando puede identificar sus tablas.
- Busqueda por seccion y busqueda global.
- Ficha de detalle adaptada a movil.
- Seleccion de carpeta de PDF sin incorporar los PDF a la base de datos.
- Apertura de PDF por nombre/ruta almacenada en la base.
- Instalable como PWA desde GitHub Pages.

IMPORTANTE
- GitHub aloja solo la aplicacion. material.db y los PDF permanecen en el telefono.
- La primera carga requiere Internet para cargar sql.js desde CDN.
- En navegadores Android que no mantengan acceso permanente a carpetas, puede ser necesario seleccionar la carpeta de PDF de nuevo al iniciar.
- Esta v1 usa deteccion automatica de esquema. Para ajustar al 100% las tablas y rutas PDF de Base_Datos_Material_v9_12_Columnas_Ajustables se recomienda revisar el material.db exacto.

SUBIR A GITHUB
1. Crear repositorio publico.
2. Subir el CONTENIDO de esta carpeta a la raiz del repositorio.
3. Settings > Pages > Deploy from a branch.
4. Branch main, carpeta /(root), Save.
