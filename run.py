import os
import subprocess
import sys

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def run_command(command):
    try:
        # Run using shell=True so Windows can resolve npm and local binaries correctly
        subprocess.run(command, shell=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"\n[Error] El comando falló con código {e.returncode}")
        input("\nPresiona Enter para continuar...")
    except FileNotFoundError:
        print(f"\n[Error] No se encontró el comando. Asegúrate de tener Node.js instalado.")
        input("\nPresiona Enter para continuar...")

def main():
    # Set the working directory to the project folder
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    while True:
        clear_screen()
        print("=" * 60)
        print("          PANEL DE CONTROL - VENTAS FORÁNEAS PWA")
        print("=" * 60)
        print("1. Iniciar Servidor Local (Probar en localhost:5173)")
        print("2. Compilar y Desplegar a Internet (Subir a Firebase Hosting)")
        print("3. Ejecutar Migración de Clientes desde MySQL")
        print("4. Instalar Dependencias del Proyecto (npm install)")
        print("5. Salir")
        print("=" * 60)
        
        choice = input("Selecciona una opción (1-5): ").strip()

        if choice == '1':
            clear_screen()
            print("[Info] Iniciando servidor local Vite...")
            print("Presiona Ctrl+C en esta terminal para detener el servidor.\n")
            run_command("npm run dev")
        elif choice == '2':
            clear_screen()
            print("[Info] Compilando el proyecto...")
            # We chain build and deploy
            run_command("npm run build && npx firebase deploy --only hosting")
            input("\nDespliegue finalizado. Presiona Enter para volver...")
        elif choice == '3':
            clear_screen()
            print("[Info] Ejecutando migración de clientes...")
            if os.path.exists("migrate_clients.js"):
                run_command("node migrate_clients.js")
            else:
                print("\n[Error] El script de migración aún no ha sido configurado.")
            input("\nPresiona Enter para volver...")
        elif choice == '4':
            clear_screen()
            print("[Info] Instalando dependencias de Node.js...")
            run_command("npm install")
            input("\nInstalación completa. Presiona Enter para volver...")
        elif choice == '5':
            print("\n¡Adiós!")
            break
        else:
            print("\nOpción no válida.")
            input("\nPresiona Enter para intentar de nuevo...")

if __name__ == '__main__':
    main()
