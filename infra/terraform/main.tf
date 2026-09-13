data "aws_availability_zones" "available" { state = "available" }
resource "aws_vpc" "main" { cidr_block = "10.42.0.0/16"; enable_dns_hostnames = true; tags = { Name = "${var.project}-${var.environment}" } }
resource "aws_subnet" "private" {
  count = 2
  vpc_id = aws_vpc.main.id
  cidr_block = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "${var.project}-private-${count.index + 1}", "kubernetes.io/role/internal-elb" = "1" }
}
resource "aws_ecr_repository" "app" { name = var.project; image_scanning_configuration { scan_on_push = true }; encryption_configuration { encryption_type = "AES256" } }
resource "aws_cloudwatch_log_group" "cluster" { name = "/aws/eks/${var.project}/${var.environment}"; retention_in_days = 30 }
resource "aws_iam_role" "cluster" {
  name = "${var.project}-${var.environment}-eks-cluster"
  assume_role_policy = jsonencode({ Version="2012-10-17", Statement=[{ Effect="Allow", Principal={ Service="eks.amazonaws.com" }, Action="sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "cluster" { role = aws_iam_role.cluster.name; policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy" }
resource "aws_eks_cluster" "main" {
  name = "${var.project}-${var.environment}"
  role_arn = aws_iam_role.cluster.arn
  version = var.kubernetes_version
  vpc_config { subnet_ids = aws_subnet.private[*].id; endpoint_private_access = true; endpoint_public_access = true }
  enabled_cluster_log_types = ["api","audit","authenticator","controllerManager","scheduler"]
  depends_on = [aws_iam_role_policy_attachment.cluster, aws_cloudwatch_log_group.cluster]
}
