import { startMockServer, isValidJSONString } from './helpers';
import * as path from 'path';

jest.setTimeout(50000);

describe('Terraform Language Support', () => {
  let run: (
    cmd: string,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  let teardown: () => void;

  beforeAll(async () => {
    const result = await startMockServer();
    run = result.run;
    teardown = result.teardown;
  });

  afterAll(async () => teardown());

  describe('without feature flag', () => {
    it('does not dereference variables', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test ./iac/terraform/var_deref`,
      );

      // expect exitCode to be 0 or 1
      expect(exitCode).toBeLessThanOrEqual(1);

      expect(stdout).toContain('Testing sg_open_ssh.tf...');
      expect(stdout.match(/✗ Security Group allows open ingress/g)).toBeNull();
      expect(stdout).toContain('Tested sg_open_ssh.tf for known issues');

      expect(stdout).toContain(
        `Testing ${path.join('nested_var_deref', 'sg_open_ssh.tf')}...`,
      );
      expect(stdout.match(/✗ Rule allows open egress/g)).toBeNull();
      expect(stdout).toContain(
        `Tested ${path.join(
          'nested_var_deref',
          'sg_open_ssh.tf',
        )} for known issues`,
      );
    });

    it('returns error if empty Terraform file', async () => {
      const { exitCode } = await run(
        `snyk iac test ./iac/terraform/empty_file.tf`,
      );

      expect(exitCode).toBe(3);
    });
  });

  describe('with feature flag', () => {
    describe('single files', () => {
      // TODO: can be merged with the existing test-terraform.spec.ts when the flag is removed
      it('finds issues in Terraform file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support iac/terraform/var_deref/sg_open_ssh.tf`,
        );

        expect(stdout).toContain(
          'Testing iac/terraform/var_deref/sg_open_ssh.tf...',
        );
        expect(
          stdout.match(/✗ Security Group allows open ingress/g),
        ).toHaveLength(1);
        expect(stdout).toContain(
          'Tested iac/terraform/var_deref/sg_open_ssh.tf for known issues',
        );
        expect(exitCode).toBe(1);
      });

      it('returns error empty Terraform file', async () => {
        const { exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/terraform/empty_file.tf`,
        );
        expect(exitCode).toBe(3);
      });
    });
    describe('single non-terraform files', () => {
      it('finds issues in a Terraform plan file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/terraform-plan/tf-plan-create.json`,
        );
        expect(stdout).toContain(
          'Testing ./iac/terraform-plan/tf-plan-create.json',
        );
        expect(stdout).toContain('Infrastructure as code issues:');
        expect(stdout).toContain('✗ S3 bucket versioning disabled');
        expect(stdout).toContain(
          'resource > aws_s3_bucket[terra_ci] > versioning > enabled',
        );
        expect(exitCode).toBe(1);
      });
      it('finds issues in CloudFormation YAML file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/cloudformation/aurora-valid.yml`,
        );
        expect(stdout).toContain(
          'Testing ./iac/cloudformation/aurora-valid.yml',
        );
        expect(stdout).toContain('Infrastructure as code issues:');
        expect(stdout).toContain(
          '✗ SNS topic is not encrypted with customer managed key',
        );
        expect(stdout).toContain(
          '[DocId: 0] > Resources[DatabaseAlarmTopic] > Properties > KmsMasterKeyId',
        );
        expect(exitCode).toBe(1);
      });

      it('finds issues in CloudFormation JSON file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/cloudformation/fargate-valid.json`,
        );
        expect(stdout).toContain(
          'Testing ./iac/cloudformation/fargate-valid.json',
        );
        expect(stdout).toContain('Infrastructure as code issues:');
        expect(stdout).toContain(
          '✗ S3 restrict public bucket control is disabled',
        );
        expect(stdout).toContain(
          'Resources[CodePipelineArtifactBucket] > Properties > PublicAccessBlockConfiguration > RestrictPublicBuckets',
        );
        expect(exitCode).toBe(1);
      });

      it('finds issues in ARM JSON file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/arm/rule_test.json`,
        );
        expect(stdout).toContain('Testing ./iac/arm/rule_test.json');
        expect(stdout).toContain('Infrastructure as code issues:');
        expect(stdout).toContain(
          '✗ Azure Firewall Network Rule Collection allows public access',
        );
        expect(stdout).toContain(
          'resources[1] > properties > networkRuleCollections[0] > properties > rules[0] > sourceAddresses',
        );
        expect(exitCode).toBe(1);
      });
      it('finds issues in Kubernetes YAML file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/kubernetes/pod-privileged.yaml`,
        );
        expect(stdout).toContain(
          'Testing ./iac/kubernetes/pod-privileged.yaml',
        );
        expect(stdout).toContain('Infrastructure as code issues:');
        expect(stdout).toContain('✗ Privileged container');
        expect(stdout).toContain(
          '[DocId: 0] > input > spec > containers[example] > securityContext > privileged',
        );
        expect(exitCode).toBe(1);
      });

      it('finds issues in Kubernetes YAML multi file', async () => {
        const { stdout, exitCode } = await run(
          `snyk iac test --org=tf-lang-support ./iac/kubernetes/pod-privileged-multi.yaml`,
        );
        expect(stdout).toContain(
          'Testing ./iac/kubernetes/pod-privileged-multi.yaml',
        );
        expect(stdout).toContain('Infrastructure as code issues:');
        expect(stdout).toContain('✗ Privileged container');
        expect(stdout).toContain(
          '[DocId: 0] > input > spec > containers[example] > securityContext > privileged',
        );
        expect(exitCode).toBe(1);
      });
    });
  });

  describe('directories', () => {
    it('dereferences variables in nested directories', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support ./iac/terraform/var_deref`,
      );

      expect(stdout).toContain('Testing sg_open_ssh.tf...');
      expect(
        stdout.match(/✗ Security Group allows open ingress/g),
      ).toHaveLength(5);
      expect(stdout).toContain('Tested sg_open_ssh.tf for known issues');

      expect(stdout).toContain(
        `Testing ${path.join('nested_var_deref', 'sg_open_ssh.tf')}...`,
      );
      expect(stdout.match(/✗ Rule allows open egress/g)).toHaveLength(1);
      expect(stdout).toContain(
        `Tested ${path.join(
          'nested_var_deref',
          'sg_open_ssh.tf',
        )} for known issues`,
      );
      expect(exitCode).toBe(1);
    });

    it('scans a mix of IaC files in nested directories', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support ./iac`,
      );

      expect(stdout).toContain(
        `Testing ${path.join('kubernetes', 'pod-privileged.yaml')}`,
      );
      expect(stdout).toContain(
        `Tested ${path.join(
          'kubernetes',
          'pod-privileged.yaml',
        )} for known issues`,
      );

      expect(stdout).toContain(
        `Testing ${path.join('terraform', 'var_deref', 'sg_open_ssh.tf')}`,
      );
      expect(
        stdout.match(/✗ Security Group allows open ingress/g),
      ).toHaveLength(8);
      expect(stdout).toContain(
        `Tested ${path.join(
          'terraform',
          'var_deref',
          'sg_open_ssh.tf',
        )} for known issues`,
      );

      expect(stdout).toContain(
        `Testing ${path.join(
          'terraform',
          'var_deref',
          'nested_var_deref',
          'sg_open_ssh.tf',
        )}...`,
      );
      expect(stdout.match(/✗ Rule allows open egress/g)).toHaveLength(1);
      expect(stdout).toContain(
        `Tested ${path.join(
          'terraform',
          'var_deref',
          'nested_var_deref',
          'sg_open_ssh.tf',
        )} for known issues`,
      );
      expect(exitCode).toBe(1);
    });
  });

  describe('other functions', () => {
    it('is backwards compatible without variable dereferencing', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support iac/terraform/sg_open_ssh.tf`,
      );

      expect(stdout).toContain('Testing iac/terraform/sg_open_ssh.tf...');
      expect(
        stdout.match(/✗ Security Group allows open ingress/g),
      ).toHaveLength(1);
      expect(stdout).toContain(
        'Tested iac/terraform/sg_open_ssh.tf for known issues',
      );
      expect(exitCode).toBe(1);
    });

    it('filters out issues when using severity threshold', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support iac/terraform/sg_open_ssh.tf --severity-threshold=high`,
      );

      expect(stdout).toContain('Testing iac/terraform/sg_open_ssh.tf...');
      expect(stdout.match(/✗ Security Group allows open ingress/g)).toBeNull();
      expect(stdout).toContain(
        'Tested iac/terraform/sg_open_ssh.tf for known issues',
      );
      // expect exitCode to be 0 or 1
      expect(exitCode).toBeLessThanOrEqual(1);
    });

    it('filters out issues when using detection depth', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support ./iac/terraform/ --detection-depth=2`,
      );

      expect(stdout).toContain(
        `Testing ${path.join('var_deref', 'sg_open_ssh.tf')}`,
      );
      expect(stdout).toContain(
        `Tested ${path.join('var_deref', 'sg_open_ssh.tf')} for known issues`,
      );
      expect(stdout).toContain(`Testing ${path.join('sg_open_ssh.tf')}`);
      expect(stdout).toContain('Tested sg_open_ssh.tf for known issues');
      expect(
        stdout.match(/✗ Security Group allows open ingress/g),
      ).toHaveLength(6);

      // Check that we didn't scan directories with depth > 2
      expect(stdout).not.toContain(
        `Testing ${path.join(
          'var_deref',
          'nested_var_deref',
          'sg_open_ssh.tf',
        )}...`,
      );
      expect(stdout.match(/✗ Rule allows open egress/g)).toBeNull();
      expect(stdout).not.toContain(
        `Tested ${path.join(
          'var_deref',
          'nested_var_deref',
          'sg_open_ssh.tf',
        )} for known issues`,
      );
      expect(exitCode).toBe(1);
    });

    it('outputs an error for files with invalid HCL2', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support ./iac/terraform/sg_open_ssh_invalid_hcl2.tf`,
      );

      expect(stdout).toContain('We were unable to parse the Terraform file');
      expect(exitCode).toBe(2);
    });

    it('outputs the expected text when running with --sarif flag', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support ./iac/terraform/sg_open_ssh.tf --sarif`,
      );

      expect(isValidJSONString(stdout)).toBe(true);
      expect(stdout).toContain('"id": "SNYK-CC-TF-1",');
      expect(stdout).toContain('"ruleId": "SNYK-CC-TF-1",');
      expect(exitCode).toBe(1);
    });

    it('outputs the expected text when running with --json flag', async () => {
      const { stdout, exitCode } = await run(
        `snyk iac test --org=tf-lang-support ./iac/terraform/sg_open_ssh.tf --json`,
      );

      expect(isValidJSONString(stdout)).toBe(true);
      expect(stdout).toContain('"id": "SNYK-CC-TF-1",');
      expect(stdout).toContain('"packageManager": "terraformconfig",');
      expect(stdout).toContain('"projectType": "terraformconfig",');
      expect(exitCode).toBe(1);
    });
  });
});
