# Dockerfile for CO Generator FastAPI Server
# Multi-stage build for optimized container size

FROM python:3.10-slim as builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Upgrade pip first, then install CPU-only PyTorch, then remaining deps
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --user --timeout 300 \
    torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir --user --timeout 300 -r requirements.txt

# ============================================================================
# Production stage
# ============================================================================

FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Install Neo4j driver for knowledge graph
RUN pip install --no-cache-dir neo4j

# Copy application code
COPY src/ /app/src/
COPY data/ /app/data/

# Create data directories if they don't exist
RUN mkdir -p /app/data/uploads /app/data/chroma_db /app/data/generated_cos

# Set Python path
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Environment variables for Neo4j (can be overridden by docker-compose)
ENV NEO4J_URI=bolt://neo4j:7687
ENV NEO4J_USER=neo4j
ENV NEO4J_PASSWORD=cogenerator123

# Run the FastAPI server with complete pipeline
CMD python -m uvicorn src.fastapi_complete:app --host 0.0.0.0 --port 8000
