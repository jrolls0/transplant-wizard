# RDS Module
# Creates PostgreSQL RDS instance

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-db-subnet-group"
  description = "Subnet group for RDS"
  subnet_ids  = var.subnet_ids

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-db"

  # Engine configuration
  engine               = "postgres"
  engine_version       = var.engine_version
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  storage_type         = "gp3"
  storage_throughput   = 125  # gp3 minimum
  iops                 = 3000 # gp3 minimum

  # Database configuration
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.vpc_security_group_ids
  publicly_accessible    = var.publicly_accessible
  multi_az               = false  # Set to true for production HA

  # Backup configuration
  backup_retention_period = 7
  backup_window           = "07:01-07:31"
  maintenance_window      = "sat:08:38-sat:09:08"
  copy_tags_to_snapshot   = true

  # Other settings
  auto_minor_version_upgrade = true
  deletion_protection        = false  # Set to true in production
  skip_final_snapshot        = true   # Set to false in production
  final_snapshot_identifier  = "${var.project_name}-db-final-snapshot"

  # Performance and monitoring
  performance_insights_enabled = false  # Enable for production
  monitoring_interval          = 0      # Set to 60 for enhanced monitoring

  # Encryption (recommended for production)
  storage_encrypted = false  # Set to true in production

  tags = {
    Name = "${var.project_name}-db"
  }

  lifecycle {
    # Prevent accidental destruction
    prevent_destroy = false  # Set to true in production
  }
}
