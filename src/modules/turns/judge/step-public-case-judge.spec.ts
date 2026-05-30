import { ExecutionEntity } from '@modules/executions/entity/execution.entity';
import { ExecutionStatus, MissionResultJudgeStatus } from '@shared/enums';
import {
  aggregatePublicCaseOutcomes,
  buildPublicCaseFailureMessage,
  evaluatePublicTestCaseExecution,
  resolveStepPublicTestCases,
  runStepPublicCaseJudging,
} from './step-public-case-judge';

describe('step-public-case-judge', () => {
  const calculatorJudgePolicy = {
    judgeType: 'PUBLIC_TEST_CASES',
    steps: [
      {
        stepOrder: 1,
        testCases: [
          {
            name: 'add_positive_integers',
            stdinLines: ['2', '+', '3'],
            expectedStdout: '5',
          },
        ],
      },
      {
        stepOrder: 5,
        testCases: [
          {
            name: 'unsupported_operator',
            stdinLines: ['8', '%', '3'],
            expectedStdout: 'ERROR: unsupported operator',
          },
          {
            name: 'division_by_zero',
            stdinLines: ['8', '/', '0'],
            expectedStdout: 'ERROR: division by zero',
          },
        ],
      },
      {
        stepOrder: 6,
        testCases: [
          {
            name: 'invalid_left_number',
            stdinLines: ['abc', '+', '3'],
            expectedStdout: 'ERROR: invalid number',
          },
        ],
      },
    ],
  };

  it('resolves test cases for the current step order', () => {
    expect(resolveStepPublicTestCases(calculatorJudgePolicy, 1)).toEqual([
      {
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
      },
    ]);
    expect(
      resolveStepPublicTestCases(calculatorJudgePolicy, 5)?.map((testCase) => testCase.name),
    ).toEqual(['unsupported_operator', 'division_by_zero']);
  });

  it('returns null when no step bundle exists', () => {
    expect(resolveStepPublicTestCases(calculatorJudgePolicy, 99)).toBeNull();
    expect(resolveStepPublicTestCases({}, 1)).toBeNull();
  });

  it('passes only when stdout, stderr, and exit code match the contract', () => {
    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: '5\n',
          stderr: '',
        }),
        '5',
      ),
    ).toBe('PASSED');

    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: '6',
          stderr: '',
        }),
        '5',
      ),
    ).toBe('FAILED');

    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: '5',
          stderr: 'traceback',
        }),
        '5',
      ),
    ).toBe('FAILED');

    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.FAILED,
          exitCode: null,
          stdout: '',
          stderr: '',
          runtimeFailureCode: 'RUNTIME_CONTAINER_UNAVAILABLE',
        }),
        '5',
      ),
    ).toBe('ERROR');
  });

  it('aggregates ERROR above FAILED', () => {
    expect(aggregatePublicCaseOutcomes(['PASSED', 'FAILED'])).toBe(
      MissionResultJudgeStatus.FAILED,
    );
    expect(aggregatePublicCaseOutcomes(['PASSED', 'ERROR'])).toBe(
      MissionResultJudgeStatus.ERROR,
    );
    expect(aggregatePublicCaseOutcomes(['PASSED', 'PASSED'])).toBe(
      MissionResultJudgeStatus.PASSED,
    );
  });

  it('accepts calculator divide-by-zero and invalid-number stdout contracts', () => {
    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: 'ERROR: division by zero',
          stderr: '',
        }),
        'ERROR: division by zero',
      ),
    ).toBe('PASSED');

    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: 'ERROR: invalid number',
          stderr: '',
        }),
        'ERROR: invalid number',
      ),
    ).toBe('PASSED');

    expect(
      evaluatePublicTestCaseExecution(
        createExecution({
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: '0',
          stderr: '',
        }),
        'ERROR: division by zero',
      ),
    ).toBe('FAILED');
  });

  it('builds a failure message when stderr is empty but stdout mismatches', () => {
    expect(
      buildPublicCaseFailureMessage({
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
        actualStdout: '6',
        stderr: '',
        exitCode: 0,
        executionStatus: ExecutionStatus.SUCCESS,
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
        outcome: 'FAILED',
      }),
    ).toBe(
      '공개 테스트 "add_positive_integers" 실패: expected "5", actual "6"',
    );
  });

  it('uses runtimeFailureMessage, then stderr, then fallback for public-case ERROR messages', () => {
    expect(
      buildPublicCaseFailureMessage({
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
        actualStdout: '',
        stderr: '',
        exitCode: null,
        executionStatus: ExecutionStatus.FAILED,
        runtimeFailureCode: 'RUNTIME_EXECUTION_FAILED',
        runtimeFailureMessage: 'Container exec failed.',
        outcome: 'ERROR',
      }),
    ).toBe('Container exec failed.');

    expect(
      buildPublicCaseFailureMessage({
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
        actualStdout: '',
        stderr: 'traceback: division by zero',
        exitCode: 1,
        executionStatus: ExecutionStatus.FAILED,
        runtimeFailureCode: null,
        runtimeFailureMessage: null,
        outcome: 'ERROR',
      }),
    ).toBe('traceback: division by zero');

    expect(
      buildPublicCaseFailureMessage({
        name: 'add_positive_integers',
        stdinLines: ['2', '+', '3'],
        expectedStdout: '5',
        actualStdout: '',
        stderr: '',
        exitCode: null,
        executionStatus: ExecutionStatus.FAILED,
        runtimeFailureCode: 'RUNTIME_EXECUTION_FAILED',
        runtimeFailureMessage: null,
        outcome: 'ERROR',
      }),
    ).toBe('공개 테스트 "add_positive_integers" 런타임 오류');
  });

  it('runs all cases and aggregates the final judgeStatus', async () => {
    const executions = [
      createExecution({
        id: 'execution-1',
        status: ExecutionStatus.SUCCESS,
        exitCode: 0,
        stdout: 'ERROR: unsupported operator',
        stderr: '',
      }),
      createExecution({
        id: 'execution-2',
        status: ExecutionStatus.SUCCESS,
        exitCode: 0,
        stdout: 'wrong',
        stderr: '',
      }),
    ];
    const executeCase = jest
      .fn()
      .mockImplementation(async () => executions.shift() as ExecutionEntity);

    const outcome = await runStepPublicCaseJudging(
      resolveStepPublicTestCases(calculatorJudgePolicy, 5)!,
      executeCase,
    );

    expect(executeCase).toHaveBeenCalledTimes(2);
    expect(outcome.judgeStatus).toBe(MissionResultJudgeStatus.FAILED);
    expect(outcome.caseResults).toHaveLength(2);
    expect(outcome.caseResults[0].outcome).toBe('PASSED');
    expect(outcome.caseResults[1].outcome).toBe('FAILED');
    expect(outcome.representativeExecution.id).toBe('execution-2');
  });

  it('runs remaining cases after runtime ERROR and still aggregates ERROR', async () => {
    const executeCase = jest
      .fn()
      .mockResolvedValueOnce(
        createExecution({
          id: 'execution-error',
          status: ExecutionStatus.FAILED,
          exitCode: null,
          stdout: '',
          stderr: '',
          runtimeFailureCode: 'RUNTIME_EXECUTION_REJECTED',
          runtimeFailureMessage: 'docker failed',
        }),
      )
      .mockResolvedValueOnce(
        createExecution({
          id: 'execution-pass',
          status: ExecutionStatus.SUCCESS,
          exitCode: 0,
          stdout: 'ERROR: division by zero',
          stderr: '',
        }),
      );

    const outcome = await runStepPublicCaseJudging(
      resolveStepPublicTestCases(calculatorJudgePolicy, 5)!,
      executeCase,
    );

    expect(executeCase).toHaveBeenCalledTimes(2);
    expect(outcome.judgeStatus).toBe(MissionResultJudgeStatus.ERROR);
    expect(outcome.caseResults).toHaveLength(2);
    expect(outcome.caseResults[0].outcome).toBe('ERROR');
    expect(outcome.caseResults[0].runtimeFailureMessage).toBe('docker failed');
    expect(buildPublicCaseFailureMessage(outcome.caseResults[0])).toBe('docker failed');
    expect(outcome.caseResults[1].outcome).toBe('PASSED');
    expect(outcome.representativeExecution.id).toBe('execution-error');
  });
});

function createExecution(
  overrides: Partial<ExecutionEntity> & Pick<ExecutionEntity, 'status'>,
): ExecutionEntity {
  return {
    id: 'execution-default',
    exitCode: 0,
    stdout: '',
    stderr: '',
    runtimeFailureCode: null,
    runtimeFailureMessage: null,
    ...overrides,
  } as ExecutionEntity;
}
