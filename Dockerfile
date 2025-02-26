# Use Node.js 18 as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Install Python, pip, and venv (for creating a virtual environment)
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv

# Create a Python virtual environment and install required packages
RUN python3 -m venv /venv && \
    /venv/bin/pip install --upgrade pip && \
    /venv/bin/pip install pandas pymongo scikit-learn

# Set the virtual environment path to use it
ENV PATH="/venv/bin:$PATH"

# Copy package.json and package-lock.json for Node.js dependencies
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the backend code
COPY . .

# Expose the port your app runs on
EXPOSE 4000

# Start the backend server
CMD ["npm", "run", "server"]
