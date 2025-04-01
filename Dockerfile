# Use Node.js 18 as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json for Node.js dependencies
COPY package*.json ./

# Copy the rest of the backend code

COPY . .

# Expose the port for Node.js
EXPOSE 4000

# Start the backend server
CMD ["npm", "run", "server"]