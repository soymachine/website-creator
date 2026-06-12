#!/bin/bash
# Doble-click en este archivo para actualizar el proyecto con los últimos cambios (git pull).
cd "$(dirname "$0")"
git pull
echo ""
echo "Listo. Pulsa cualquier tecla para cerrar..."
read -n 1 -s
