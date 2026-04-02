import sys

filepath = 'Dockerfile'
content = open(filepath).read()

# Add a RUN command to create the tokens directory and set permissions
# This ensures that even if we are switching to USER node, we have the folder ready.
# Actually, setting the workdir to /app and copying files with chown is good,
# but the runtime might try to create a tokens/ folder in the root of the app.
# Let's ensure the whole /app is writable by node.

old_workdir = "WORKDIR /app"
if "RUN mkdir -p /app/tokens && chown -R node:node /app" not in content:
    # After apk add
    insertion = "\nRUN mkdir -p /app/tokens && chown -R node:node /app\n"
    content = content.replace("# Use the existing node user (UID 1000)", insertion + "# Use the existing node user (UID 1000)")

    # Also ensure we copy files before chown-ing if we want to be safe, but copying from build stage is later.
    # Let's just make sure the destination folder is ready and writable.

    open(filepath, 'w').write(content)
    print("Success")
else:
    print("Already updated.")
