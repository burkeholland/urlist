#!/usr/bin/env bash
set -euo pipefail

# ---- Configuration ----
RESOURCE_GROUP="${RESOURCE_GROUP:-urlist-rg}"
LOCATION="${LOCATION:-eastus2}"
APP_NAME="${APP_NAME:-urlist}"
CONTAINER_IMAGE="${CONTAINER_IMAGE:?Set CONTAINER_IMAGE (e.g. ghcr.io/yourorg/urlist:latest)}"
TARGET_PORT="${TARGET_PORT:-3000}"
COSMOS_RESOURCE_GROUP="${COSMOS_RESOURCE_GROUP:-Databases}"
COSMOS_ACCOUNT_NAME="${COSMOS_ACCOUNT_NAME:-DB01}"

# These will be prompted if not set
GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:?Set GITHUB_CLIENT_ID from your GitHub OAuth App}"
GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:?Set GITHUB_CLIENT_SECRET from your GitHub OAuth App}"
AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"

echo "==> Creating resource group: $RESOURCE_GROUP in $LOCATION"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Deploying Azure resources via Bicep..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters \
    appName="$APP_NAME" \
    location="$LOCATION" \
    containerImage="$CONTAINER_IMAGE" \
    targetPort="$TARGET_PORT" \
    githubClientId="$GITHUB_CLIENT_ID" \
    githubClientSecret="$GITHUB_CLIENT_SECRET" \
    authSecret="$AUTH_SECRET" \
    cosmosResourceGroup="$COSMOS_RESOURCE_GROUP" \
    cosmosAccountName="$COSMOS_ACCOUNT_NAME" \
  --output json

echo ""
echo "==> Deployment complete!"
echo ""

# Extract outputs
APP_URL=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name main \
  --query properties.outputs.appUrl.value -o tsv)

echo "App URL:        $APP_URL"
echo ""
echo "Next steps:"
echo "  1. Set your GitHub OAuth App callback URL to: ${APP_URL}/api/auth/callback"
echo "  2. Push your container image to: $CONTAINER_IMAGE"
echo "  3. The app will start automatically once the image is available"
