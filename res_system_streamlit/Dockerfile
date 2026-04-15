FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --timeout 300 -r requirements.txt

# Install FastAPI and uvicorn
RUN pip install --no-cache-dir fastapi uvicorn[standard] pydantic

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/data /app/logs

# Expose port
EXPOSE 8004

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Run the FastAPI application
CMD ["python", "-m", "uvicorn", "fastapi_main:app", "--host", "0.0.0.0", "--port", "8004", "--reload"]

